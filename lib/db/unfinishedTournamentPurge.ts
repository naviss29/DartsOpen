import { prisma } from "./client";
import type { Prisma, TournamentStatus } from "../generated/prisma/client";
import { deleteTournamentTreeTx, withTournamentLock } from "./tournament";

/**
 * DO-UNFINISHED-PURGE-001 — règle métier décidée par Alan le 30/09/2026 pour les tournois jamais
 * terminés (statut ≠ FINISHED, seul statut terminal de `TournamentStatus` — il n'existe pas de
 * statut « annulé ») dont la `date` est passée :
 *   1. à J+1 (lendemain de la date), un rappel est envoyé au créateur : « clôturez le tournoi,
 *      sinon toutes ses données seront supprimées sous 48 h » — un seul envoi par tournoi ;
 *   2. 48 h après ce rappel (donc au plus tôt J+3), si le tournoi n'est toujours pas FINISHED,
 *      le tournoi et TOUT ce qui en dépend sont supprimés.
 * Garde-fou absolu : jamais de suppression sans rappel réellement envoyé (l'horodatage n'est
 * posé qu'après succès de l'envoi), et la condition est revérifiée sous verrou, dans la même
 * transaction que la suppression — un organisateur qui clôture entre-temps est épargné.
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
  | "DELETE";

export type UnfinishedTournamentState = {
  status: TournamentStatus;
  date: Date;
  closeReminderSentAt: Date | null;
};

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
  if (sentAt === undefined || sentAt < reminderValidFrom) return "SEND_REMINDER";

  return now.getTime() - sentAt >= GRACE_MS ? "DELETE" : "AWAITING_GRACE";
}

/** Date à partir de laquelle un rappel envoyé à `sentAt` autorise la suppression (affichée dans l'email). */
export function deletionNotBefore(sentAt: Date): Date {
  return new Date(sentAt.getTime() + GRACE_MS);
}

export type CloseReminderTarget = {
  tournamentId: string;
  /** Identifiant SterPlatform du créateur (`Tournament.userId`) — DartsOpen ne stocke pas son email. */
  creatorUserId: string;
  tournamentName: string;
  tournamentDate: Date;
  deletionNotBefore: Date;
};

/**
 * Port d'envoi du rappel. `send` doit lever une erreur si l'email n'est pas parti : aucune
 * erreur ⇒ horodatage posé ⇒ suppression possible 48 h plus tard. `available = false` signale
 * dès le dry-run qu'aucun rappel ne pourra partir (voir lib/tournament/closeReminderNotifier.ts).
 */
export type CloseReminderNotifier = {
  available: boolean;
  unavailableReason?: string;
  send: (target: CloseReminderTarget) => Promise<void>;
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
  /** Email parti mais le tournoi a changé entre-temps (clôturé/reporté) : horodatage non posé. */
  | "REMINDER_SKIPPED_CHANGED"
  | "AWAITING_GRACE"
  | "DELETED"
  | "DELETION_WOULD_RUN"
  | "DELETION_FAILED"
  /** Condition revérifiée sous verrou : tournoi clôturé/reporté/déjà supprimé entre-temps. */
  | "SPARED";

export type UnfinishedTournamentEntry = {
  tournamentId: string;
  status: TournamentStatus;
  date: Date;
  closeReminderSentAt: Date | null;
  outcome: UnfinishedTournamentOutcome;
  counts?: TournamentTreeCounts;
  error?: string;
};

export type UnfinishedTournamentPurgeReport = {
  dryRun: boolean;
  now: Date;
  scanned: number;
  remindersSent: number;
  remindersFailed: number;
  awaitingGrace: number;
  deleted: number;
  deletionsFailed: number;
  spared: number;
  /** Tournois en échec (rappel ou suppression) — le lot continue, le script sort en code 1. */
  errors: number;
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
      select: { status: true, date: true, closeReminderSentAt: true },
    });
    if (!current || classifyUnfinishedTournament(current, now) !== "SEND_REMINDER") return false;
    await tx.tournament.update({ where: { id: tournamentId }, data: { closeReminderSentAt: sentAt } });
    return true;
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
  return withTournamentLock(tournamentId, async (tx) => {
    const current = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, date: true, closeReminderSentAt: true },
    });
    if (!current || classifyUnfinishedTournament(current, now) !== "DELETE") return { deleted: false as const };
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
    remindersFailed: 0,
    awaitingGrace: 0,
    deleted: 0,
    deletionsFailed: 0,
    spared: 0,
    errors: 0,
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
      select: { id: true, userId: true, name: true, date: true, status: true, closeReminderSentAt: true },
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
        } else if (action === "SEND_REMINDER") {
          const target: CloseReminderTarget = {
            tournamentId: t.id,
            creatorUserId: t.userId,
            tournamentName: t.name,
            tournamentDate: t.date,
            deletionNotBefore: deletionNotBefore(now),
          };
          if (dryRun) {
            entry.outcome = "REMINDER_WOULD_SEND";
            log(
              `${prefix} ${label} : rappel de clôture À ENVOYER` +
                (notifier.available ? "." : ` — ATTENTION : envoi impossible actuellement (${notifier.unavailableReason}).`),
            );
          } else {
            try {
              await notifier.send(target);
            } catch (err) {
              // Pas d'email ⇒ pas d'horodatage ⇒ jamais de suppression pour ce tournoi.
              report.remindersFailed += 1;
              report.errors += 1;
              entry.outcome = "REMINDER_FAILED";
              entry.error = err instanceof Error ? err.message : String(err);
              log(`${prefix} ${label} : ÉCHEC de l'envoi du rappel, aucun horodatage posé : ${entry.error}`);
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
        if (action === "SEND_REMINDER") {
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
