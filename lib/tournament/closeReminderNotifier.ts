import type { CloseReminderNotifier, CloseReminderSendResult, CloseReminderTarget } from "../db/unfinishedTournamentPurge";
import {
  sendEmailToOrganization,
  sendEmailToUser,
  type SendEmailToOrganizationOutcome,
  type SendEmailToUserOutcome,
} from "../api/sterplatformInternal";

/**
 * DO-UNFINISHED-PURGE-001 — envoi du rappel « clôturez votre tournoi ».
 *
 * ADR-0021 / L7 (D6) — destinataires : tous les OWNER/ADMIN de l'organisation du tournoi, via
 * `POST {SterPlatform}/api/email/send-to-organization` (UUID `Tournament.organizationId`) : ce
 * sont eux qui peuvent clôturer le tournoi, le créateur n'a plus de droit propre. Repli pour un
 * tournoi sans organisation (données d'avant L6, organisation héritée partagée) : le créateur
 * seul, via `POST /api/email/send-to-user` (`Tournament.userId`). Dans les deux cas DartsOpen ne
 * connaît que des UUID ; SterPlatform résout les adresses et ne les renvoie jamais (ARCH-001).
 *
 * Le template n'existe qu'en français côté SterPlatform (pas de langue préférée sur `User`) :
 * les dates sont donc formatées en français, fuseau Europe/Paris.
 */

export const CLOSE_REMINDER_TEMPLATE = "dartsopen_tournament_close_reminder";

type SendToUser = (template: string, userId: string, variables: Record<string, string>) => Promise<SendEmailToUserOutcome>;
type SendToOrganization = (
  template: string,
  organizationId: string,
  variables: Record<string, string>,
) => Promise<SendEmailToOrganizationOutcome>;

type NotifierDeps = {
  env?: Record<string, string | undefined>;
  sendToUser?: SendToUser;
  sendToOrganization?: SendToOrganization;
};

/**
 * Traduction de l'issue `send-to-organization` vers le port de la purge. Règle de sûreté : AUCUNE
 * issue d'un envoi à une organisation ne devient RECIPIENT_NOT_FOUND — seule issue qui ouvre une
 * suppression sans rappel, réservée au 404 `USER_NOT_FOUND` d'un créateur. Un 404 (organisation
 * ou template introuvable, indiscernables) ou un 422 (aucun OWNER/ADMIN actif) laisse donc le
 * tournoi sans rappel, retenté au passage suivant, jamais supprimé (« un 404 ne supprime pas »).
 * Ils sont comptés comme des échecs (code de sortie 1) pour rester visibles dans Coolify.
 */
function fromOrganizationOutcome(result: SendEmailToOrganizationOutcome): CloseReminderSendResult {
  switch (result.outcome) {
    case "SENT":
      return { outcome: "SENT" };
    case "CONFIGURATION_ERROR":
      return { outcome: "CONFIGURATION_ERROR", error: result.error };
    case "NOT_FOUND":
    case "NO_RECIPIENT":
    case "FAILED":
      return { outcome: "FAILED", error: result.error };
  }
}

function fromUserOutcome(result: SendEmailToUserOutcome): CloseReminderSendResult {
  switch (result.outcome) {
    case "SENT":
      return { outcome: "SENT" };
    case "RECIPIENT_NOT_FOUND":
      return { outcome: "RECIPIENT_NOT_FOUND" };
    case "CONFIGURATION_ERROR":
      return { outcome: "CONFIGURATION_ERROR", error: result.error };
    default:
      return { outcome: "FAILED", error: result.error };
  }
}

/**
 * « 1 octobre » → « 1er octobre » : Intl ne produit pas l'ordinal français du premier du mois,
 * or l'email est lu par un humain.
 */
function withFrenchFirstOrdinal(formatted: string): string {
  return formatted.replace(/^1 /, "1er ");
}

/**
 * `Tournament.date` est un `@db.Date` lu à minuit UTC : formaté en UTC pour ne jamais décaler le
 * jour (c'est une date calendaire, pas un instant).
 */
export function formatTournamentDateFr(date: Date): string {
  return withFrenchFirstOrdinal(new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(date));
}

/**
 * Instant à partir duquel la suppression devient possible (envoi + 48 h), en heure de Paris,
 * avec l'heure : le template dit « Clôturez-le avant le {{ deletionDate }} ». Honnête dans les
 * deux sens — aucune suppression n'a lieu avant cet instant (la règle l'interdit), et comme la
 * tâche ne passe qu'une fois par jour elle peut survenir plus tard, jamais plus tôt : clôturer
 * avant cette échéance garantit toujours de conserver le tournoi.
 */
export function formatDeletionDateFr(deletionNotBefore: Date): string {
  return withFrenchFirstOrdinal(
    new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(deletionNotBefore),
  );
}

/**
 * Page d'administration du tournoi (`app/(dashboard)/tournaments/[id]`), celle qui porte le bouton
 * « Clôturer le tournoi » ; protégée par l'authentification (redirection vers la connexion si besoin).
 */
export function buildTournamentAdminUrl(appUrl: string, tournamentId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/tournaments/${encodeURIComponent(tournamentId)}`;
}

/**
 * Variables d'environnement lues au runtime par la tâche planifiée (conteneur DartsOpen) : mêmes
 * variables que le reste de l'application, aucune nouvelle. Pas de repli `localhost` pour
 * l'URL du site (contrairement à d'autres écrans) : un lien faux dans un email qui annonce une
 * suppression est pire que pas d'email — et sans email il n'y a jamais de suppression.
 */
const REQUIRED_ENV = ["NEXT_PUBLIC_API_URL", "STER_API_TOKEN", "NEXT_PUBLIC_APP_URL"] as const;

export function createCloseReminderNotifier(deps: NotifierDeps = {}): CloseReminderNotifier {
  const env = deps.env ?? process.env;
  const sendToUser = deps.sendToUser ?? sendEmailToUser;
  const sendToOrganization = deps.sendToOrganization ?? sendEmailToOrganization;
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    const reason = `variable(s) d'environnement manquante(s) : ${missing.join(", ")}`;
    return {
      available: false,
      unavailableReason: reason,
      // Configuration cassée : même traitement qu'un 401/403 (aucun horodatage, script en échec).
      send: async () => ({ outcome: "CONFIGURATION_ERROR", error: `Rappel de clôture impossible : ${reason}.` }),
    };
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL!.trim();

  return {
    available: true,
    send: async (target: CloseReminderTarget): Promise<CloseReminderSendResult> => {
      try {
        const variables = {
          tournamentName: target.tournamentName,
          tournamentDate: formatTournamentDateFr(target.tournamentDate),
          deletionDate: formatDeletionDateFr(target.deletionNotBefore),
          tournamentUrl: buildTournamentAdminUrl(appUrl, target.tournamentId),
        };
        if (target.organizationId) {
          return fromOrganizationOutcome(await sendToOrganization(CLOSE_REMINDER_TEMPLATE, target.organizationId, variables));
        }
        return fromUserOutcome(await sendToUser(CLOSE_REMINDER_TEMPLATE, target.creatorUserId, variables));
      } catch (err) {
        // Filet : le client ne lève pas, mais un formatage ou une dépendance injectée pourrait.
        return { outcome: "FAILED", error: `Envoi du rappel de clôture en échec : ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
