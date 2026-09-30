import type { CloseReminderNotifier } from "../db/unfinishedTournamentPurge";

/**
 * DO-UNFINISHED-PURGE-001 — envoi du rappel « clôturez votre tournoi » au créateur.
 *
 * BLOQUÉ côté SterPlatform (constaté le 30/09/2026, aucun contournement volontairement) :
 * DartsOpen ne connaît du créateur que son identifiant SterPlatform (`Tournament.userId`) —
 * jamais son email (ARCH-001 : SterPlatform possède User). Or :
 *   1. `POST /api/email/send` exige l'adresse `to` en clair, et aucun endpoint serveur-à-serveur
 *      (`X-App-Token`) ne permet de résoudre un utilisateur par son id (seul `GET /api/auth/me`,
 *      avec le JWT de l'utilisateur lui-même, expose l'email — indisponible dans une tâche
 *      planifiée) ; `POST /api/email/send-to-organization` vise les OWNER/ADMIN d'une
 *      organisation par UUID, pas le créateur (DartsOpen ne connaît qu'un slug, et seulement
 *      si l'organisateur l'a lié) ;
 *   2. aucun template `dartsopen_*` de rappel de clôture n'existe dans `email_templates` ;
 *   3. `User` n'a pas de langue préférée : impossible de choisir FR/EN/ES par créateur.
 * Tant que ces éléments manquent, `send` lève une erreur : aucun rappel n'est horodaté, donc
 * aucune suppression n'a jamais lieu (garde-fou de la règle). Voir CLAUDE.md, section « Purge des
 * tournois jamais terminés », pour le contrat proposé.
 */
export const CLOSE_REMINDER_UNAVAILABLE_REASON =
  "SterPlatform n'expose aucun moyen serveur-à-serveur d'écrire au créateur à partir de son identifiant " +
  "(endpoint de résolution utilisateur ou d'envoi par userId + template de rappel manquants)";

export function createCloseReminderNotifier(): CloseReminderNotifier {
  return {
    available: false,
    unavailableReason: CLOSE_REMINDER_UNAVAILABLE_REASON,
    send: async () => {
      throw new Error(`Rappel de clôture impossible : ${CLOSE_REMINDER_UNAVAILABLE_REASON}.`);
    },
  };
}
