import { prisma } from "./client";
import type { Prisma, TournamentStatus } from "../generated/prisma/client";
import { deleteTournamentTreeTx, withTournamentLock } from "./tournament";
import { effectiveOrganizationId } from "../auth/legacyOrganizations";

/**
 * DO-UNFINISHED-PURGE-001 — règle métier décidée par Alan le 30/09/2026 pour les tournois jamais
 * terminés (statut ≠ FINISHED, seul statut terminal de `TournamentStatus` — il n'existe pas de
 * statut « annulé ») dont la `date` est passée :
 *   1. à J+1 (lendemain de la date), un rappel est envoyé au créateur : « clôturez le tournoi,
 *      sinon toutes ses données seront supprimées sous 48 h » — un seul envoi par tournoi ;
 *   2. 48 h après ce rappel (donc au plus tôt J+3), si le tournoi n'est toujours pas FINISHED,
 *      le tournoi et TOUT ce qui en dépend sont supprimés.
 * Garde-fou : jamais de suppression sans rappel réellement envoyé (l'horodatage n'est posé
 * qu'après succès de l'envoi), et la condition est revérifiée sous verrou, dans la même
 * transaction que la suppression — un organisateur qui clôture entre-temps est épargné.
 *
 * SEULE exception (complément décidé par Alan le 30/09/2026) : le rappel ne PEUT pas partir parce
 * que SterPlatform répond 404 `USER_NOT_FOUND` (créateur supprimé, ou membre d'aucune
 * organisation où DARTSOPEN est actif). Sans exception, un tel tournoi ne serait jamais supprimé.
 * Il l'est donc sans email, au premier passage à partir de J+1 00:00 UTC + 48 h, si :
 *   - ce 404 a été constaté et horodaté (`closeReminderRecipientNotFoundAt`) à partir de J+1 de la
 *     date COURANTE ;
 *   - le rappel est RETENTÉ lors de ce passage et SterPlatform répond encore 404 USER_NOT_FOUND
 *     (un créateur redevenu joignable reçoit son rappel et bénéficie des 48 h normales) ;
 *   - la condition est revérifiée sous verrou dans la transaction de suppression.
 * Tout autre échec (5xx, réseau, 400, 401/403, template absent) ne pose rien et n'autorise rien :
 * on ne supprime jamais parce que SterPlatform était en panne ou mal configuré.
 */

/** Délai de grâce entre le rappel et la suppression (décision Alan). */
export const CLOSE_REMINDER_GRACE_HOURS = 48;

/** Taille de page par défaut (tournois lus par requête de balayage). */
export const DEFAULT_UNFINISHED_PURGE_BATCH_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = CLOSE_REMINDER_GRACE_HOURS * 60 * 60 * 1000;

/**
 * Minuit UTC du jour de `now`. `Tournament.date` est un `@db.Date` (lu à minuit UTC) : un tournoi
 * daté du jour J devient « passé » à J+1 00:00 UTC, jamais pendant sa propre journée.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type UnfinishedTournamentAction =
  /** Rien à faire : tournoi terminé, ou pas encore J+1. */
  | "NOT_DUE"
  /** J+1 atteint et aucun rappel valable pour la date courante : envoyer le rappel. */
  | "SEND_REMINDER"
  /** Rappel envoyé, délai de 48 h pas encore écoulé. */
  | "AWAITING_GRACE"
  /** Rappel envoyé depuis au moins 48 h, tournoi toujours pas terminé : supprimer. */
  | "DELETE"
  /**
   * Aucun rappel valable, créateur constaté introuvable (404 USER_NOT_FOUND) à partir de J+1 et
   * J+1 00:00 UTC + 48 h atteint : retenter le rappel ; s'il répond ENCORE 404 USER_NOT_FOUND,
   * supprimer sans rappel (s'il part, cycle normal de 48 h).
   */
  | "DELETE_IF_RECIPIENT_STILL_NOT_FOUND";

export type UnfinishedTournamentState = {
  status: TournamentStatus;
  date: Date;
  closeReminderSentAt: Date | null;
  /** Absent = null (jamais constaté). */
  closeReminderRecipientNotFoundAt?: Date | null;
};

/** Le tournoi attend encore un rappel (qu'une suppression sans rappel soit possible ou non). */
export function needsCloseReminder(action: UnfinishedTournamentAction): boolean {
  return action === "SEND_REMINDER" || action === "DELETE_IF_RECIPIENT_STILL_NOT_FOUND";
}

/**
 * Décision pure (sans E/S), partagée entre le balayage, la revérification sous verrou avant
 * l'horodatage et la revérification sous verrou avant la suppression — une seule règle, jamais
 * trois copies qui divergeraient.
 *
 * Un rappel n'est « valable » que s'il a été envoyé à partir de J+1 de la date COURANTE : si
 * l'organisateur reporte son tournoi après avoir reçu un rappel, l'ancien rappel ne vaut plus
 * avertissement (sinon la nouvelle date passée déclencherait une suppression immédiate, sans
 * nouveau rappel) — un nouveau rappel est alors envoyé.
 */
export function classifyUnfinishedTournament(t: UnfinishedTournamentState, now: Date): UnfinishedTournamentAction {
  if (t.status === "FINISHED") return "NOT_DUE";
  if (t.date.getTime() >= startOfUtcDay(now).getTime()) return "NOT_DUE";

  const reminderValidFrom = t.date.getTime() + DAY_MS;
  const sentAt = t.closeReminderSentAt?.getTime();
  if (sentAt !== undefined && sentAt >= reminderValidFrom) {
    // Un rappel réellement envoyé prime toujours : ses 48 h s'appliquent, même si un 404 avait
    // été constaté avant (créateur redevenu joignable).
    return now.getTime() - sentAt >= GRACE_MS ? "DELETE" : "AWAITING_GRACE";
  }

  // Même règle de validité que le rappel : un 404 constaté pour une date antérieure (tournoi
  // reporté depuis) ne compte pas, sinon le report déclencherait une suppression sans nouvel essai.
  const notFoundAt = t.closeReminderRecipientNotFoundAt?.getTime();
  if (
    notFoundAt !== undefined &&
    notFoundAt >= reminderValidFrom &&
    now.getTime() >= reminderValidFrom + GRACE_MS
  ) {
    return "DELETE_IF_RECIPIENT_STILL_NOT_FOUND";
  }
  return "SEND_REMINDER";
}

/**
 * Instant à partir duquel un tournoi dont le créateur est introuvable peut être supprimé sans
 * rappel : J+1 00:00 UTC + 48 h (décision Alan). `date` est un `@db.Date` (minuit UTC).
 */
export function deletionWithoutReminderNotBefore(date: Date): Date {
  return new Date(date.getTime() + DAY_MS + GRACE_MS);
}

/** Date à partir de laquelle un rappel envoyé à `sentAt` autorise la suppression (affichée dans l'email). */
export function deletionNotBefore(sentAt: Date): Date {
  return new Date(sentAt.getTime() + GRACE_MS);
}

export type CloseReminderTarget = {
  tournamentId: string;
  /** Identifiant SterPlatform du créateur (`Tournament.userId`) — DartsOpen ne stocke pas son email. */
  creatorUserId: string;
  /**
   * ADR-0021 / L7 (D6) — UUID SterPlatform de l'organisation du tournoi (`effectiveOrganizationId`,
   * jamais une organisation héritée partagée) : le rappel part alors à tous ses OWNER/ADMIN.
   * `null` : tournoi sans organisation ⇒ rappel au seul créateur (repli transitoire).
   */
  organizationId: string | null;
  tournamentName: string;
  tournamentDate: Date;
  deletionNotBefore: Date;
};

/**
 * Issue d'un envoi de rappel. SEUL `SENT` pose `closeReminderSentAt` (donc autorise une
 * suppression 48 h plus tard) ; tout le reste laisse le tournoi sans rappel, retenté au passage
 * suivant.
 * - RECIPIENT_NOT_FOUND : SterPlatform ne trouve pas le créateur (404 USER_NOT_FOUND : compte
 *   supprimé, ou plus membre d'aucune organisation où DartsOpen est actif) — propre à CE tournoi ;
 *   seule issue d'échec qui pose un horodatage (`closeReminderRecipientNotFoundAt`) et peut mener
 *   à une suppression sans rappel à J+1 + 48 h ;
 * - CONFIGURATION_ERROR : jeton refusé (401/403), template absent, variable manquante — casse
 *   TOUS les envois ;
 * - FAILED : transitoire ou inattendu (400, 5xx, réseau).
 */
export type CloseReminderSendResult =
  | { outcome: "SENT" }
  | { outcome: "RECIPIENT_NOT_FOUND" }
  | { outcome: "CONFIGURATION_ERROR"; error: string }
  | { outcome: "FAILED"; error: string };

/**
 * Port d'envoi du rappel (implémentation : lib/tournament/closeReminderNotifier.ts). `send` ne
 * devrait pas lever ; s'il le fait, l'exception est traitée comme FAILED. `available = false`
 * signale dès le dry-run qu'aucun rappel ne pourra partir (configuration manquante).
 */
export type CloseReminderNotifier = {
  available: boolean;
  unavailableReason?: string;
  send: (target: CloseReminderTarget) => Promise<CloseReminderSendResult>;
};

/** Lignes rattachées à un tournoi — affichées en dry-run et journalisées à la suppression. */
export type TournamentTreeCounts = {
  registrations: number;
  onlinePaidRegistrations: number;
  refundPendingRegistrations: number;
  rounds: number;
  pools: number;
  poolPlayers: number;
  matches: number;
  matchSets: number;
  matchSetThrows: number;
  fieldSessions: number;
  fieldRefereeGrants: number;
  fieldIncidents: number;
};

type ReadClient = Prisma.TransactionClient | typeof prisma;

export async function countTournamentTree(client: ReadClient, tournamentId: string): Promise<TournamentTreeCounts> {
  const [
    registrations,
    onlinePaidRegistrations,
    refundPendingRegistrations,
    rounds,
    pools,
    poolPlayers,
    matches,
    matchSets,
    matchSetThrows,
    fieldSessions,
    fieldRefereeGrants,
    fieldIncidents,
  ] = await Promise.all([
    client.registration.count({ where: { tournamentId } }),
    // Paiements en ligne réellement encaissés : la suppression efface la seule trace locale
    // (voir CLAUDE.md, « données hors base ») — rendu visible dans le journal pour l'exploitant.
    client.registration.count({ where: { tournamentId, feeCollected: true } }),
    client.registration.count({ where: { tournamentId, status: "REFUND_PENDING" } }),
    client.round.count({ where: { tournamentId } }),
    client.pool.count({ where: { tournamentId } }),
    client.poolPlayer.count({ where: { pool: { tournamentId } } }),
    client.match.count({ where: { tournamentId } }),
    client.matchSet.count({ where: { match: { tournamentId } } }),
    client.matchSetThrow.count({ where: { matchSet: { match: { tournamentId } } } }),
    client.fieldSession.count({ where: { tournamentId } }),
    client.fieldRefereeGrant.count({ where: { tournamentId } }),
    client.fieldIncident.count({ where: { tournamentId } }),
  ]);
  return {
    registrations,
    onlinePaidRegistrations,
    refundPendingRegistrations,
    rounds,
    pools,
    poolPlayers,
    matches,
    matchSets,
    matchSetThrows,
    fieldSessions,
    fieldRefereeGrants,
    fieldIncidents,
  };
}

export type UnfinishedTournamentOutcome =
  | "REMINDER_SENT"
  | "REMINDER_WOULD_SEND"
  | "REMINDER_FAILED"
  /**
   * SterPlatform ne trouve pas le créateur (404 USER_NOT_FOUND) avant l'échéance J+1 + 48 h :
   * constat horodaté, rappel retenté au passage suivant.
   */
  | "REMINDER_RECIPIENT_NOT_FOUND"
  /** Configuration cassée (401/403, template absent, variable manquante) : pas d'horodatage. */
  | "REMINDER_CONFIGURATION_ERROR"
  /** Rappel non tenté : une erreur de configuration a déjà été constatée pendant ce passage. */
  | "REMINDER_NOT_ATTEMPTED"
  /** Email parti mais le tournoi a changé entre-temps (clôturé/reporté) : horodatage non posé. */
  | "REMINDER_SKIPPED_CHANGED"
  | "AWAITING_GRACE"
  /** Supprimé 48 h après un rappel réellement envoyé. */
  | "DELETED"
  /** Supprimé sans rappel : créateur introuvable (404 USER_NOT_FOUND) constaté puis reconfirmé. */
  | "DELETED_WITHOUT_REMINDER"
  | "DELETION_WOULD_RUN"
  /** Dry-run : le rappel serait retenté ; si le créateur est toujours introuvable, suppression sans rappel. */
  | "DELETION_WITHOUT_REMINDER_WOULD_RUN"
  | "DELETION_FAILED"
  /** Condition revérifiée sous verrou : tournoi clôturé/reporté/déjà supprimé entre-temps. */
  | "SPARED";

export type UnfinishedTournamentEntry = {
  tournamentId: string;
  status: TournamentStatus;
  date: Date;
  closeReminderSentAt: Date | null;
  closeReminderRecipientNotFoundAt: Date | null;
  outcome: UnfinishedTournamentOutcome;
  counts?: TournamentTreeCounts;
  error?: string;
};

export type UnfinishedTournamentPurgeReport = {
  dryRun: boolean;
  now: Date;
  scanned: number;
  remindersSent: number;
  /**
   * 404 USER_NOT_FOUND avant l'échéance (hors suppressions sans rappel, comptées dans
   * deletedWithoutReminder) — journalisés, ne font pas échouer le script (problème de données,
   * pas de service).
   */
  remindersRecipientNotFound: number;
  /** Envois tentés et en échec (5xx, réseau, 400, configuration) — hors 404 et hors rappels non tentés. */
  remindersFailed: number;
  /** Rappels non tentés parce qu'une erreur de configuration a déjà été constatée pendant ce passage. */
  remindersNotAttempted: number;
  awaitingGrace: number;
  /** Total des suppressions = deletedAfterReminder + deletedWithoutReminder. */
  deleted: number;
  /** Supprimés 48 h après un rappel réellement envoyé. */
  deletedAfterReminder: number;
  /** Supprimés sans rappel : créateur introuvable (404 USER_NOT_FOUND) constaté puis reconfirmé. */
  deletedWithoutReminder: number;
  deletionsFailed: number;
  spared: number;
  /** Tournois en échec (rappel ou suppression) — le lot continue, le script sort en code 1. */
  errors: number;
  /**
   * Première erreur de configuration constatée (401/403, template absent, variable manquante),
   * `null` sinon. Non nulle ⇒ plus aucun envoi tenté pendant ce passage et le script sort en
   * code 2 (voir purgeUnfinishedTournaments).
   */
  configurationError: string | null;
  entries: UnfinishedTournamentEntry[];
};

export type UnfinishedTournamentPurgeOptions = {
  notifier: CloseReminderNotifier;
  now?: Date;
  dryRun?: boolean;
  batchSize?: number;
  log?: (message: string) => void;
  /**
   * Restreint le balayage à ces tournois (en plus de la règle). Sert aux tests sur base réelle
   * partagée — le balayage global attraperait sinon les fixtures d'autres fichiers exécutés en
   * parallèle ; jamais utilisé par la tâche planifiée.
   */
  onlyTournamentIds?: string[];
};

/**
 * Pose l'horodatage du rappel sous verrou, SEULEMENT si le tournoi a encore besoin d'un rappel
 * (conditionnel : un tournoi clôturé/reporté entre la lecture et l'envoi n'est pas horodaté ;
 * idempotent : un second passage concurrent qui trouverait déjà un rappel valable ne réécrit
 * rien). Renvoie `true` si l'horodatage a été posé.
 */
export async function markCloseReminderSent(tournamentId: string, sentAt: Date, now: Date): Promise<boolean> {
  return withTournamentLock(tournamentId, async (tx) => {
    const current = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, date: true, closeReminderSentAt: true, closeReminderRecipientNotFoundAt: true },
    });
    if (!current || !needsCloseReminder(classifyUnfinishedTournament(current, now))) return false;
    await tx.tournament.update({ where: { id: tournamentId }, data: { closeReminderSentAt: sentAt } });
    return true;
  });
}

/**
 * Horodate sous verrou le premier 404 USER_NOT_FOUND constaté pour la date courante du tournoi,
 * SEULEMENT si le tournoi attend toujours un rappel (clôturé/reporté entre-temps ⇒ rien). Un
 * constat déjà valable n'est jamais réécrit : on garde la PREMIÈRE observation (trace utile à
 * l'exploitant ; l'échéance, elle, se compte depuis J+1 et non depuis ce constat).
 */
export async function markCloseReminderRecipientNotFound(
  tournamentId: string,
  observedAt: Date,
  now: Date,
): Promise<"RECORDED" | "ALREADY_RECORDED" | "CHANGED"> {
  return withTournamentLock(tournamentId, async (tx) => {
    const current = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, date: true, closeReminderSentAt: true, closeReminderRecipientNotFoundAt: true },
    });
    if (!current || !needsCloseReminder(classifyUnfinishedTournament(current, now))) return "CHANGED" as const;
    const existing = current.closeReminderRecipientNotFoundAt?.getTime();
    if (existing !== undefined && existing >= current.date.getTime() + DAY_MS) return "ALREADY_RECORDED" as const;
    await tx.tournament.update({ where: { id: tournamentId }, data: { closeReminderRecipientNotFoundAt: observedAt } });
    return "RECORDED" as const;
  });
}

/**
 * Supprime le tournoi et tout ce qui en dépend SEULEMENT si la condition est toujours remplie,
 * revérifiée sous le verrou du tournoi (le même que dbUpdateTournamentStatus : une clôture
 * concurrente est soit déjà visible ici, soit attend la fin de cette transaction et échoue
 * alors proprement sur un tournoi inexistant).
 */
export async function deleteUnfinishedTournamentIfDue(
  tournamentId: string,
  now: Date,
): Promise<{ deleted: true; counts: TournamentTreeCounts } | { deleted: false }> {
  return deleteUnfinishedTournamentIfClassifiedAs(tournamentId, now, "DELETE");
}

/**
 * Suppression SANS rappel (créateur introuvable) : à n'appeler qu'après un 404 USER_NOT_FOUND
 * reçu PENDANT ce passage. Même revérification sous verrou : un tournoi clôturé ou reporté
 * entre-temps (ou dont le rappel a finalement été envoyé) n'est pas supprimé.
 */
export async function deleteUnfinishedTournamentWithoutReminderIfDue(
  tournamentId: string,
  now: Date,
): Promise<{ deleted: true; counts: TournamentTreeCounts } | { deleted: false }> {
  return deleteUnfinishedTournamentIfClassifiedAs(tournamentId, now, "DELETE_IF_RECIPIENT_STILL_NOT_FOUND");
}

async function deleteUnfinishedTournamentIfClassifiedAs(
  tournamentId: string,
  now: Date,
  expected: "DELETE" | "DELETE_IF_RECIPIENT_STILL_NOT_FOUND",
): Promise<{ deleted: true; counts: TournamentTreeCounts } | { deleted: false }> {
  return withTournamentLock(tournamentId, async (tx) => {
    const current = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, date: true, closeReminderSentAt: true, closeReminderRecipientNotFoundAt: true },
    });
    if (!current || classifyUnfinishedTournament(current, now) !== expected) return { deleted: false as const };
    const counts = await countTournamentTree(tx, tournamentId);
    await deleteTournamentTreeTx(tx, tournamentId);
    return { deleted: true as const, counts };
  });
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function describeCounts(c: TournamentTreeCounts): string {
  return (
    `${c.registrations} inscription(s) [dont ${c.onlinePaidRegistrations} payée(s) en ligne, ` +
    `${c.refundPendingRegistrations} remboursement(s) en attente], ${c.rounds} manche(s), ${c.pools} poule(s), ` +
    `${c.poolPlayers} affectation(s) de poule, ${c.matches} match(s), ${c.matchSets} set(s), ` +
    `${c.matchSetThrows} volée(s), ${c.fieldSessions} session(s) terrain, ${c.fieldRefereeGrants} accès arbitre, ` +
    `${c.fieldIncidents} incident(s)`
  );
}

/**
 * Balayage global (tous organisateurs) des tournois jamais terminés dont la date est passée,
 * paginé par curseur sur `Tournament.id`. Chaque tournoi est traité dans son propre try/catch :
 * un échec (email, base) est journalisé et compté sans arrêter le lot. `dryRun` : lectures
 * seules, aucun email envoyé, aucune écriture.
 *
 * Ordre rappel → horodatage (jamais l'inverse, contrairement au principe « enregistrer avant
 * l'effet externe ») : un horodatage posé avant un envoi qui échoue autoriserait une suppression
 * sans avertissement. Le prix est un éventuel second rappel si l'écriture échoue après l'envoi —
 * préférable à une suppression non annoncée. Deux exécutions simultanées du script pourraient
 * aussi envoyer deux rappels (jamais deux horodatages) : la tâche est planifiée une fois par jour.
 */
export async function purgeUnfinishedTournaments(
  options: UnfinishedTournamentPurgeOptions,
): Promise<UnfinishedTournamentPurgeReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? DEFAULT_UNFINISHED_PURGE_BATCH_SIZE;
  const log = options.log ?? (() => {});
  const { notifier } = options;

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`Taille de lot invalide (${batchSize}) : un entier strictement positif est attendu.`);
  }

  const report: UnfinishedTournamentPurgeReport = {
    dryRun,
    now,
    scanned: 0,
    remindersSent: 0,
    remindersRecipientNotFound: 0,
    remindersFailed: 0,
    remindersNotAttempted: 0,
    awaitingGrace: 0,
    deleted: 0,
    deletedAfterReminder: 0,
    deletedWithoutReminder: 0,
    deletionsFailed: 0,
    spared: 0,
    errors: 0,
    configurationError: null,
    entries: [],
  };

  const prefix = "[purge-unfinished-tournaments]";
  const todayStart = startOfUtcDay(now);

  let cursor: string | undefined;
  for (;;) {
    // Hors try/catch par tournoi : sans cette lecture le curseur ne peut plus avancer, l'erreur
    // remonte donc à l'appelant (script → code de sortie 1).
    const page = await prisma.tournament.findMany({
      where: {
        status: { not: "FINISHED" },
        date: { lt: todayStart },
        ...(options.onlyTournamentIds ? { id: { in: options.onlyTournamentIds } } : {}),
      },
      select: {
        id: true,
        userId: true,
        name: true,
        date: true,
        status: true,
        closeReminderSentAt: true,
        closeReminderRecipientNotFoundAt: true,
        organizationId: true,
        organizationSlug: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const t of page) {
      report.scanned += 1;
      const action = classifyUnfinishedTournament(t, now);
      if (action === "NOT_DUE") continue;

      const entry: UnfinishedTournamentEntry = {
        tournamentId: t.id,
        status: t.status,
        date: t.date,
        closeReminderSentAt: t.closeReminderSentAt,
        closeReminderRecipientNotFoundAt: t.closeReminderRecipientNotFoundAt,
        outcome: "AWAITING_GRACE",
      };
      const label = `tournoi ${t.id} (date ${formatDay(t.date)}, statut ${t.status})`;

      try {
        if (action === "AWAITING_GRACE") {
          report.awaitingGrace += 1;
          entry.outcome = "AWAITING_GRACE";
          log(
            `${prefix} ${label} : rappel envoyé le ${t.closeReminderSentAt!.toISOString()}, suppression possible ` +
              `à partir du ${deletionNotBefore(t.closeReminderSentAt!).toISOString()}.`,
          );
        } else if (needsCloseReminder(action)) {
          const deleteIfStillNotFound = action === "DELETE_IF_RECIPIENT_STILL_NOT_FOUND";
          const target: CloseReminderTarget = {
            tournamentId: t.id,
            creatorUserId: t.userId,
            organizationId: effectiveOrganizationId({ organization_id: t.organizationId, organization_slug: t.organizationSlug }),
            tournamentName: t.name,
            tournamentDate: t.date,
            deletionNotBefore: deletionNotBefore(now),
          };
          if (dryRun && deleteIfStillNotFound) {
            const counts = await countTournamentTree(prisma, t.id);
            entry.outcome = "DELETION_WITHOUT_REMINDER_WOULD_RUN";
            entry.counts = counts;
            log(
              `${prefix} ${label} : créateur introuvable (404) constaté le ${t.closeReminderRecipientNotFoundAt!.toISOString()} — ` +
                `rappel à retenter ; s'il répond encore 404, SERAIT SUPPRIMÉ SANS RAPPEL avec ${describeCounts(counts)}.`,
            );
          } else if (dryRun) {
            entry.outcome = "REMINDER_WOULD_SEND";
            log(
              `${prefix} ${label} : rappel de clôture À ENVOYER ` +
                // Destinataires sans aucune donnée personnelle : seulement leur nature (D6).
                (target.organizationId ? "(propriétaires et administrateurs de l'organisation)" : "(créateur, tournoi sans organisation)") +
                (notifier.available ? "." : ` — ATTENTION : envoi impossible actuellement (${notifier.unavailableReason}).`),
            );
          } else if (report.configurationError !== null) {
            // Une erreur de configuration (jeton refusé, template absent) casse TOUS les envois :
            // inutile de solliciter SterPlatform N fois de plus pour N refus identiques (et autant
            // d'alertes de sécurité dans ses journaux). Les suppressions, elles, continuent : elles
            // ne reposent que sur des rappels réellement envoyés lors de passages précédents.
            report.remindersNotAttempted += 1;
            report.errors += 1;
            entry.outcome = "REMINDER_NOT_ATTEMPTED";
            log(`${prefix} ${label} : rappel non tenté (configuration SterPlatform en erreur), aucun horodatage posé.`);
          } else {
            let result: CloseReminderSendResult;
            try {
              result = await notifier.send(target);
            } catch (err) {
              result = { outcome: "FAILED", error: err instanceof Error ? err.message : String(err) };
            }
            if (result.outcome !== "SENT") {
              // Pas d'email confirmé ⇒ pas de closeReminderSentAt ⇒ pas de suppression « après
              // rappel » ; retenté au passage suivant. Seul le 404 USER_NOT_FOUND ouvre la voie
              // d'une suppression sans rappel — jamais une panne ni une erreur de configuration.
              if (result.outcome === "RECIPIENT_NOT_FOUND" && deleteIfStillNotFound) {
                // 404 USER_NOT_FOUND déjà constaté, reconfirmé à l'instant, J+1 + 48 h atteint :
                // le rappel ne pourra jamais partir — suppression sans email (décision Alan).
                // Revérifiée sous verrou (clôture/report concurrent ⇒ épargné).
                try {
                  const deletion = await deleteUnfinishedTournamentWithoutReminderIfDue(t.id, now);
                  if (deletion.deleted) {
                    report.deleted += 1;
                    report.deletedWithoutReminder += 1;
                    entry.outcome = "DELETED_WITHOUT_REMINDER";
                    entry.counts = deletion.counts;
                    log(`${prefix} ${label} : SUPPRIMÉ SANS RAPPEL (créateur introuvable côté SterPlatform, 404 reconfirmé) avec ${describeCounts(deletion.counts)}.`);
                  } else {
                    report.spared += 1;
                    entry.outcome = "SPARED";
                    log(`${prefix} ${label} : épargné (clôturé, reporté ou supprimé entre-temps).`);
                  }
                } catch (err) {
                  report.deletionsFailed += 1;
                  report.errors += 1;
                  entry.outcome = "DELETION_FAILED";
                  entry.error = err instanceof Error ? err.message : String(err);
                  log(`${prefix} ${label} : ÉCHEC de la suppression sans rappel (transaction annulée, rien supprimé) : ${entry.error}`);
                }
              } else if (result.outcome === "RECIPIENT_NOT_FOUND") {
                // Problème de données propre à ce créateur (compte supprimé, plus membre d'une
                // organisation DartsOpen active), pas une panne : ne fait pas échouer la tâche.
                // Le constat est horodaté : il autorisera la suppression sans rappel à J+1 + 48 h
                // si le 404 est reconfirmé alors. Journal : id du tournoi seulement, jamais le nom
                // ni l'email du créateur.
                report.remindersRecipientNotFound += 1;
                entry.outcome = "REMINDER_RECIPIENT_NOT_FOUND";
                const recorded = await markCloseReminderRecipientNotFound(t.id, now, now);
                const deadline = deletionWithoutReminderNotBefore(t.date).toISOString();
                log(
                  `${prefix} ${label} : créateur introuvable côté SterPlatform (404), rappel non envoyé — ` +
                    (recorded === "CHANGED"
                      ? "tournoi modifié entre-temps (clôturé/reporté), rien horodaté."
                      : `constat ${recorded === "RECORDED" ? "horodaté" : "déjà horodaté"} ; rappel retenté à chaque passage, ` +
                        `suppression sans rappel à partir du ${deadline} si le créateur est toujours introuvable.`),
                );
              } else {
                report.remindersFailed += 1;
                report.errors += 1;
                entry.error = result.error;
                if (result.outcome === "CONFIGURATION_ERROR") {
                  report.configurationError = result.error;
                  entry.outcome = "REMINDER_CONFIGURATION_ERROR";
                  log(`${prefix} ${label} : ERREUR DE CONFIGURATION, aucun horodatage posé, plus aucun rappel tenté pendant ce passage : ${result.error}`);
                } else {
                  entry.outcome = "REMINDER_FAILED";
                  log(`${prefix} ${label} : ÉCHEC de l'envoi du rappel, aucun horodatage posé : ${result.error}`);
                }
              }
              report.entries.push(entry);
              continue;
            }
            const marked = await markCloseReminderSent(t.id, now, now);
            if (marked) {
              report.remindersSent += 1;
              entry.outcome = "REMINDER_SENT";
              log(`${prefix} ${label} : rappel de clôture envoyé et horodaté.`);
            } else {
              entry.outcome = "REMINDER_SKIPPED_CHANGED";
              log(`${prefix} ${label} : rappel envoyé mais tournoi modifié entre-temps (clôturé/reporté) — non horodaté.`);
            }
          }
        } else {
          // action === "DELETE"
          if (dryRun) {
            const counts = await countTournamentTree(prisma, t.id);
            entry.outcome = "DELETION_WOULD_RUN";
            entry.counts = counts;
            log(`${prefix} ${label} : SERAIT SUPPRIMÉ avec ${describeCounts(counts)}.`);
          } else {
            try {
              const result = await deleteUnfinishedTournamentIfDue(t.id, now);
              if (result.deleted) {
                report.deleted += 1;
                report.deletedAfterReminder += 1;
                entry.outcome = "DELETED";
                entry.counts = result.counts;
                log(`${prefix} ${label} : SUPPRIMÉ avec ${describeCounts(result.counts)}.`);
              } else {
                report.spared += 1;
                entry.outcome = "SPARED";
                log(`${prefix} ${label} : épargné (clôturé, reporté ou supprimé entre-temps).`);
              }
            } catch (err) {
              report.deletionsFailed += 1;
              report.errors += 1;
              entry.outcome = "DELETION_FAILED";
              entry.error = err instanceof Error ? err.message : String(err);
              log(`${prefix} ${label} : ÉCHEC de la suppression (transaction annulée, rien supprimé) : ${entry.error}`);
            }
          }
        }
      } catch (err) {
        // Filet de sécurité (ex. écriture de l'horodatage en échec après un envoi réussi) :
        // un tournoi problématique ne doit jamais bloquer les suivants.
        report.errors += 1;
        entry.error = err instanceof Error ? err.message : String(err);
        if (needsCloseReminder(action)) {
          report.remindersFailed += 1;
          entry.outcome = "REMINDER_FAILED";
        } else {
          report.deletionsFailed += 1;
          entry.outcome = "DELETION_FAILED";
        }
        log(`${prefix} ${label} : ÉCHEC inattendu : ${entry.error}`);
      }
      report.entries.push(entry);
    }

    if (page.length < batchSize) break;
  }

  return report;
}
