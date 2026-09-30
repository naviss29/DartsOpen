// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbDeleteTournament } from "./tournament";
import {
  purgeUnfinishedTournaments,
  deleteUnfinishedTournamentIfDue,
  deleteUnfinishedTournamentWithoutReminderIfDue,
  type CloseReminderNotifier,
  type CloseReminderSendResult,
  type UnfinishedTournamentPurgeReport,
} from "./unfinishedTournamentPurge";
import { createCloseReminderNotifier } from "../tournament/closeReminderNotifier";
import type { TournamentStatus } from "../generated/prisma/client";

/**
 * DO-UNFINISHED-PURGE-001 — preuves contre un vrai PostgreSQL (jamais mocké) : c'est la vraie
 * clause `where`, le vrai verrou et la vraie suppression (contraintes RESTRICT comprises) qui
 * portent la règle. Seul l'envoi d'email (frontière SterPlatform) est simulé.
 *
 * Isolation (base partagée, fichiers exécutés en parallèle) : le balayage est restreint aux
 * tournois créés ici (`onlyTournamentIds`), il ne touche donc jamais les fixtures des autres
 * fichiers ; et les fixtures sont datées de 1995, après le seuil fixe de
 * contactRetention.db.test.ts (1989-06-15), pour que sa purge globale ne compte jamais nos
 * tournois FINISHED.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const H = 60 * 60 * 1000;
// J+1 d'un tournoi daté du 14/06/1995, à l'heure recommandée de la tâche planifiée.
const REMINDER_RUN = new Date("1995-06-15T04:00:00.000Z");

const createdTournamentIds: string[] = [];

afterEach(async () => {
  for (const id of createdTournamentIds) {
    // Suppression ordonnée (contraintes RESTRICT) ; un tournoi déjà supprimé par le test est ignoré.
    const exists = await prisma.tournament.findUnique({ where: { id }, select: { id: true } });
    if (exists) await dbDeleteTournament(id);
  }
  createdTournamentIds.length = 0;
});

/**
 * Simule SterPlatform : `outcomes[tournamentId]` force l'issue de l'envoi pour ce tournoi
 * (sinon SENT) ; une fonction permet de faire varier l'issue d'un passage à l'autre.
 */
function fakeNotifier(
  outcomes: Record<string, CloseReminderSendResult | (() => CloseReminderSendResult)> = {},
): CloseReminderNotifier & { send: ReturnType<typeof vi.fn> } {
  return {
    available: true,
    send: vi.fn(async (target: { tournamentId: string }): Promise<CloseReminderSendResult> => {
      const forced = outcomes[target.tournamentId];
      if (forced === undefined) return { outcome: "SENT" };
      return typeof forced === "function" ? forced() : forced;
    }),
  };
}

const SMTP_DOWN: CloseReminderSendResult = { outcome: "FAILED", error: "SterPlatform send-to-user 500 : SMTP indisponible (simulé)" };
const NOT_FOUND: CloseReminderSendResult = { outcome: "RECIPIENT_NOT_FOUND" };
const BAD_TOKEN: CloseReminderSendResult = { outcome: "CONFIGURATION_ERROR", error: "SterPlatform refuse l'appel (401) (simulé)" };

async function createTournament(date: string, status: TournamentStatus = "OPEN", closeReminderSentAt: Date | null = null) {
  const t = await prisma.tournament.create({
    data: {
      userId: `org-${randomUUID()}`,
      name: `Tournoi jamais terminé ${date}`,
      date: day(date),
      location: "Salle test",
      status,
      maxPlayers: 16,
      idempotencyKey: randomUUID(),
      closeReminderSentAt,
    },
  });
  createdTournamentIds.push(t.id);
  return t;
}

/**
 * Arbre complet d'un tournoi joué : toutes les tables rattachées, y compris celles reliées par
 * des FK RESTRICT (matches.player1_id, match_sets.round_id, match_set_throws.player_id) qui font
 * échouer un simple `DELETE FROM tournaments`.
 */
async function createFullTree(tournamentId: string) {
  const round = await prisma.round.create({
    data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" },
  });
  const [p1, p2] = await Promise.all(
    ["A", "B"].map((n) =>
      prisma.registration.create({
        data: { tournamentId, playerName: `Joueur ${n}`, playerEmail: `${n.toLowerCase()}@example.com`, status: "PAID" },
      }),
    ),
  );
  const pool = await prisma.pool.create({ data: { tournamentId, name: "Poule A" } });
  await prisma.poolPlayer.createMany({
    data: [
      { poolId: pool.id, registrationId: p1.id },
      { poolId: pool.id, registrationId: p2.id },
    ],
  });
  const match = await prisma.match.create({
    data: {
      tournamentId,
      poolId: pool.id,
      player1Id: p1.id,
      player2Id: p2.id,
      winnerId: p1.id,
      forfeitedPlayerId: p2.id,
      status: "FINISHED",
    },
  });
  const set = await prisma.matchSet.create({ data: { matchId: match.id, roundId: round.id, winnerId: p1.id } });
  await prisma.matchSetThrow.create({
    data: {
      matchSetId: set.id,
      playerId: p1.id,
      sequence: 1,
      scoreEntered: 60,
      remainingBefore: 501,
      remainingAfter: 441,
      clientRequestId: randomUUID(),
    },
  });
  await prisma.fieldSession.create({
    data: { tokenHash: randomUUID(), tournamentId, matchId: match.id, expiresAt: day("1995-06-20") },
  });
  await prisma.fieldRefereeGrant.create({
    data: { tokenHash: randomUUID(), tournamentId, matchId: match.id, expiresAt: day("1995-06-20") },
  });
  await prisma.fieldIncident.create({
    data: { tournamentId, matchId: match.id, type: "PLAYER_ABSENT", reportedBy: "PLAYER" },
  });
  return { roundId: round.id, poolId: pool.id, matchId: match.id, setId: set.id, registrationIds: [p1.id, p2.id] };
}

async function remainingRows(tournamentId: string, tree: Awaited<ReturnType<typeof createFullTree>>) {
  const [tournaments, registrations, rounds, pools, poolPlayers, matches, sets, throws, sessions, grants, incidents] =
    await Promise.all([
      prisma.tournament.count({ where: { id: tournamentId } }),
      prisma.registration.count({ where: { OR: [{ tournamentId }, { id: { in: tree.registrationIds } }] } }),
      prisma.round.count({ where: { OR: [{ tournamentId }, { id: tree.roundId }] } }),
      prisma.pool.count({ where: { OR: [{ tournamentId }, { id: tree.poolId }] } }),
      prisma.poolPlayer.count({ where: { OR: [{ poolId: tree.poolId }, { registrationId: { in: tree.registrationIds } }] } }),
      prisma.match.count({ where: { OR: [{ tournamentId }, { id: tree.matchId }] } }),
      prisma.matchSet.count({ where: { OR: [{ matchId: tree.matchId }, { id: tree.setId }] } }),
      prisma.matchSetThrow.count({ where: { OR: [{ matchSetId: tree.setId }, { playerId: { in: tree.registrationIds } }] } }),
      prisma.fieldSession.count({ where: { OR: [{ tournamentId }, { matchId: tree.matchId }] } }),
      prisma.fieldRefereeGrant.count({ where: { OR: [{ tournamentId }, { matchId: tree.matchId }] } }),
      prisma.fieldIncident.count({ where: { OR: [{ tournamentId }, { matchId: tree.matchId }] } }),
    ]);
  return { tournaments, registrations, rounds, pools, poolPlayers, matches, sets, throws, sessions, grants, incidents };
}

/** Balayage restreint aux tournois de ce fichier (voir « Isolation » ci-dessus). */
function purge(options: Omit<Parameters<typeof purgeUnfinishedTournaments>[0], "onlyTournamentIds">) {
  return purgeUnfinishedTournaments({ ...options, onlyTournamentIds: [...createdTournamentIds] });
}

function entryFor(report: UnfinishedTournamentPurgeReport, id: string) {
  return report.entries.find((e) => e.tournamentId === id);
}

async function reminderOf(id: string) {
  return (await prisma.tournament.findUnique({ where: { id }, select: { closeReminderSentAt: true } }))?.closeReminderSentAt ?? null;
}

async function notFoundOf(id: string) {
  return (
    await prisma.tournament.findUnique({ where: { id }, select: { closeReminderRecipientNotFoundAt: true } })
  )?.closeReminderRecipientNotFoundAt ?? null;
}

// Tournois datés du 14/06/1995 : J+1 00:00 UTC + 48 h = 17/06/1995 00:00 UTC ; passage quotidien
// de 04:00 UTC ce jour-là = premier passage autorisé à supprimer sans rappel.
const NO_REMINDER_DEADLINE_RUN = new Date("1995-06-17T04:00:00.000Z");

describe("purgeUnfinishedTournaments — rappel (vrai PostgreSQL)", () => {
  it("aucun rappel le jour même du tournoi ni pour un tournoi FINISHED ; rappel à J+1", async () => {
    const today = await createTournament("1995-06-15");
    const finished = await createTournament("1995-06-10", "FINISHED");
    const due = await createTournament("1995-06-14", "IN_PROGRESS");
    const notifier = fakeNotifier();

    const report = await purge({ notifier, now: REMINDER_RUN });

    expect(entryFor(report, today.id)).toBeUndefined();
    expect(entryFor(report, finished.id)).toBeUndefined();
    expect(entryFor(report, due.id)?.outcome).toBe("REMINDER_SENT");
    expect(await reminderOf(today.id)).toBeNull();
    expect(await reminderOf(finished.id)).toBeNull();
    expect((await reminderOf(due.id))?.toISOString()).toBe(REMINDER_RUN.toISOString());
    const sentTo = notifier.send.mock.calls.map(([t]) => t.tournamentId);
    expect(sentTo).toContain(due.id);
    expect(sentTo).not.toContain(today.id);
    expect(sentTo).not.toContain(finished.id);
    const target = notifier.send.mock.calls.find(([t]) => t.tournamentId === due.id)![0];
    expect(target.creatorUserId).toBe(due.userId);
    expect(target.deletionNotBefore.toISOString()).toBe("1995-06-17T04:00:00.000Z");
  });

  it("n'envoie le rappel qu'une seule fois (second passage : aucun nouvel envoi, horodatage inchangé)", async () => {
    const t = await createTournament("1995-06-14");
    const notifier = fakeNotifier();

    await purge({ notifier, now: REMINDER_RUN });
    const second = await purge({ notifier, now: new Date(REMINDER_RUN.getTime() + 24 * H) });

    expect(notifier.send.mock.calls.filter(([x]) => x.tournamentId === t.id)).toHaveLength(1);
    expect(entryFor(second, t.id)?.outcome).toBe("AWAITING_GRACE");
    expect((await reminderOf(t.id))?.toISOString()).toBe(REMINDER_RUN.toISOString());
  });

  it("échec d'email → aucun horodatage, donc aucune suppression même bien après 48 h ; le lot continue", async () => {
    const failing = await createTournament("1995-06-14");
    const ok = await createTournament("1995-06-13");
    const notifier = fakeNotifier({ [failing.id]: SMTP_DOWN });

    const report = await purge({ notifier, now: REMINDER_RUN });
    expect(entryFor(report, failing.id)?.outcome).toBe("REMINDER_FAILED");
    expect(entryFor(report, failing.id)?.error).toContain("SMTP");
    expect(entryFor(report, ok.id)?.outcome).toBe("REMINDER_SENT");
    expect(report.errors).toBeGreaterThanOrEqual(1);
    expect(await reminderOf(failing.id)).toBeNull();

    const later = await purge({ notifier, now: new Date(REMINDER_RUN.getTime() + 72 * H) });
    expect(entryFor(later, failing.id)?.outcome).toBe("REMINDER_FAILED");
    expect(await prisma.tournament.count({ where: { id: failing.id } })).toBe(1);
  });

  it("exception levée par le notifier : traitée comme un échec, aucun horodatage", async () => {
    const t = await createTournament("1995-06-14");
    const notifier: CloseReminderNotifier = {
      available: true,
      send: async () => {
        throw new Error("fetch failed (simulé)");
      },
    };
    const report = await purge({ notifier, now: REMINDER_RUN });
    expect(entryFor(report, t.id)?.outcome).toBe("REMINDER_FAILED");
    expect(entryFor(report, t.id)?.error).toContain("fetch failed");
    expect(await reminderOf(t.id)).toBeNull();
  });

  it("notifier réel sans configuration (variables absentes) : erreur de configuration, aucun horodatage", async () => {
    const t = await createTournament("1995-06-14");
    const report = await purge({ notifier: createCloseReminderNotifier({ env: {} }), now: REMINDER_RUN });
    expect(entryFor(report, t.id)?.outcome).toBe("REMINDER_CONFIGURATION_ERROR");
    expect(report.configurationError).toContain("STER_API_TOKEN");
    expect(await reminderOf(t.id)).toBeNull();
  });

  it("créateur introuvable (404) puis redevenu joignable : constat horodaté, rappel envoyé au passage suivant, cycle normal de 48 h", async () => {
    const t = await createTournament("1995-06-14");
    let firstRun = true;
    const notifier = fakeNotifier({ [t.id]: () => (firstRun ? NOT_FOUND : { outcome: "SENT" }) });
    const logs: string[] = [];

    const report = await purge({ notifier, now: REMINDER_RUN, log: (m) => logs.push(m) });
    expect(entryFor(report, t.id)?.outcome).toBe("REMINDER_RECIPIENT_NOT_FOUND");
    expect(report.remindersRecipientNotFound).toBe(1);
    expect(report.errors).toBe(0);
    expect(await reminderOf(t.id)).toBeNull();
    expect((await notFoundOf(t.id))?.toISOString()).toBe(REMINDER_RUN.toISOString());
    const line = logs.find((l) => l.includes(t.id))!;
    expect(line).toContain("404");
    expect(line).not.toContain("Tournoi jamais terminé");

    // Échéance J+1 + 48 h atteinte, mais le rappel part cette fois : pas de suppression sans
    // rappel, le créateur bénéficie des 48 h normales à compter de cet envoi.
    firstRun = false;
    const retry = new Date(REMINDER_RUN.getTime() + 48 * H);
    const second = await purge({ notifier, now: retry });
    expect(entryFor(second, t.id)?.outcome).toBe("REMINDER_SENT");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);
    expect((await reminderOf(t.id))?.toISOString()).toBe(retry.toISOString());

    // Le délai de 48 h court depuis le rappel RÉELLEMENT envoyé, pas depuis le premier essai.
    const early = await purge({ notifier, now: new Date(retry.getTime() + 47 * H) });
    expect(entryFor(early, t.id)?.outcome).toBe("AWAITING_GRACE");
    const due = await purge({ notifier, now: new Date(retry.getTime() + 48 * H) });
    expect(entryFor(due, t.id)?.outcome).toBe("DELETED");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(0);
  });

  it("erreur de configuration (401/403) : plus aucun envoi tenté, suppressions déjà dues traitées quand même", async () => {
    // Ordre de balayage = ordre des ids : on ne présume pas lequel des deux tournois à rappeler
    // passe en premier, le notifier refuse les deux.
    const a = await createTournament("1995-06-14");
    const b = await createTournament("1995-06-13");
    const toDelete = await createTournament("1995-06-10", "IN_PROGRESS", new Date(REMINDER_RUN.getTime() - 48 * H));
    const notifier = fakeNotifier({ [a.id]: BAD_TOKEN, [b.id]: BAD_TOKEN });

    const report = await purge({ notifier, now: REMINDER_RUN });

    expect(report.configurationError).toContain("401");
    const outcomes = [entryFor(report, a.id)?.outcome, entryFor(report, b.id)?.outcome].sort();
    expect(outcomes).toEqual(["REMINDER_CONFIGURATION_ERROR", "REMINDER_NOT_ATTEMPTED"]);
    expect(notifier.send).toHaveBeenCalledTimes(1);
    expect(report.remindersNotAttempted).toBe(1);
    expect(report.errors).toBe(2);
    expect(await reminderOf(a.id)).toBeNull();
    expect(await reminderOf(b.id)).toBeNull();
    expect(entryFor(report, toDelete.id)?.outcome).toBe("DELETED");
  });

  it("réponse 5xx : échec compté, aucun horodatage, les autres tournois continuent", async () => {
    const failing = await createTournament("1995-06-14");
    const ok = await createTournament("1995-06-12");
    const report = await purge({ notifier: fakeNotifier({ [failing.id]: SMTP_DOWN }), now: REMINDER_RUN });
    expect(entryFor(report, failing.id)?.outcome).toBe("REMINDER_FAILED");
    expect(report.configurationError).toBeNull();
    expect(entryFor(report, ok.id)?.outcome).toBe("REMINDER_SENT");
    expect(await reminderOf(failing.id)).toBeNull();
  });
});

describe("purgeUnfinishedTournaments — suppression (vrai PostgreSQL)", () => {
  it("aucune suppression avant 48 h pleines après le rappel", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS", REMINDER_RUN);
    await createFullTree(t.id);

    const report = await purge({ notifier: fakeNotifier(), now: new Date(REMINDER_RUN.getTime() + 48 * H - 1000) });

    expect(entryFor(report, t.id)?.outcome).toBe("AWAITING_GRACE");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);
  });

  it("après 48 h : supprime le tournoi et TOUTES ses lignes liées (FK RESTRICT comprises)", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS", REMINDER_RUN);
    const tree = await createFullTree(t.id);
    const before = await remainingRows(t.id, tree);
    expect(Object.values(before).every((n) => n > 0)).toBe(true);

    const report = await purge({ notifier: fakeNotifier(), now: new Date(REMINDER_RUN.getTime() + 48 * H) });

    const entry = entryFor(report, t.id);
    expect(entry?.outcome).toBe("DELETED");
    expect(entry?.counts).toMatchObject({ registrations: 2, rounds: 1, pools: 1, poolPlayers: 2, matches: 1, matchSets: 1, matchSetThrows: 1, fieldSessions: 1, fieldRefereeGrants: 1, fieldIncidents: 1 });
    const after = await remainingRows(t.id, tree);
    expect(after).toEqual({ tournaments: 0, registrations: 0, rounds: 0, pools: 0, poolPlayers: 0, matches: 0, sets: 0, throws: 0, sessions: 0, grants: 0, incidents: 0 });
  });

  it("tournoi clôturé entre le rappel et l'échéance : épargné, rien supprimé", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS", REMINDER_RUN);
    const tree = await createFullTree(t.id);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "FINISHED" } });

    const report = await purge({ notifier: fakeNotifier(), now: new Date(REMINDER_RUN.getTime() + 72 * H) });

    expect(entryFor(report, t.id)).toBeUndefined();
    expect(Object.values(await remainingRows(t.id, tree)).every((n) => n > 0)).toBe(true);
  });

  it("revérification sous verrou : un tournoi clôturé après la lecture du balayage n'est pas supprimé", async () => {
    // Simule la course : le balayage a classé le tournoi « à supprimer », puis l'organisateur
    // clôture avant la transaction de suppression — c'est la relecture sous verrou qui décide.
    const t = await createTournament("1995-06-14", "IN_PROGRESS", REMINDER_RUN);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "FINISHED" } });

    const result = await deleteUnfinishedTournamentIfDue(t.id, new Date(REMINDER_RUN.getTime() + 72 * H));

    expect(result.deleted).toBe(false);
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);
  });

  it("tournoi reporté après le rappel : jamais supprimé sur l'ancien rappel, nouveau rappel à la nouvelle J+1", async () => {
    const t = await createTournament("1995-06-14", "OPEN", REMINDER_RUN);
    await prisma.tournament.update({ where: { id: t.id }, data: { date: day("1995-06-20") } });
    const notifier = fakeNotifier();

    const beforeNewDate = await purge({ notifier, now: new Date("1995-06-18T04:00:00.000Z") });
    expect(entryFor(beforeNewDate, t.id)).toBeUndefined();
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);

    const afterNewDate = await purge({ notifier, now: new Date("1995-06-21T04:00:00.000Z") });
    expect(entryFor(afterNewDate, t.id)?.outcome).toBe("REMINDER_SENT");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);
  });
});

describe("purgeUnfinishedTournaments — créateur introuvable, suppression sans rappel (vrai PostgreSQL)", () => {
  it("404 à J+1 puis reconfirmé au premier passage ≥ J+1 00:00 UTC + 48 h : supprimé sans rappel, arbre complet", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS");
    const tree = await createFullTree(t.id);
    const notifier = fakeNotifier({ [t.id]: NOT_FOUND });

    await purge({ notifier, now: REMINDER_RUN });
    // Passage intermédiaire (J+2) : toujours 404, constat conservé (première observation), rien supprimé.
    const j2 = await purge({ notifier, now: new Date(REMINDER_RUN.getTime() + 24 * H) });
    expect(entryFor(j2, t.id)?.outcome).toBe("REMINDER_RECIPIENT_NOT_FOUND");
    expect((await notFoundOf(t.id))?.toISOString()).toBe(REMINDER_RUN.toISOString());
    // Juste avant l'échéance : toujours rien supprimé.
    const early = await purge({ notifier, now: new Date("1995-06-16T23:59:59.000Z") });
    expect(entryFor(early, t.id)?.outcome).toBe("REMINDER_RECIPIENT_NOT_FOUND");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);

    const logs: string[] = [];
    const report = await purge({ notifier, now: NO_REMINDER_DEADLINE_RUN, log: (m) => logs.push(m) });

    const entry = entryFor(report, t.id);
    expect(entry?.outcome).toBe("DELETED_WITHOUT_REMINDER");
    expect(entry?.counts).toMatchObject({ registrations: 2, matches: 1, matchSetThrows: 1 });
    expect(report.deletedWithoutReminder).toBe(1);
    expect(report.deletedAfterReminder).toBe(0);
    expect(report.deleted).toBe(1);
    expect(report.errors).toBe(0);
    // Le rappel a bien été retenté à l'échéance avant de supprimer (4 passages = 4 essais).
    expect(notifier.send.mock.calls.filter(([x]) => x.tournamentId === t.id)).toHaveLength(4);
    expect(await remainingRows(t.id, tree)).toEqual({ tournaments: 0, registrations: 0, rounds: 0, pools: 0, poolPlayers: 0, matches: 0, sets: 0, throws: 0, sessions: 0, grants: 0, incidents: 0 });
    const line = logs.find((l) => l.includes(t.id))!;
    expect(line).toContain("SUPPRIMÉ SANS RAPPEL");
    expect(line).not.toContain("Tournoi jamais terminé");
    expect(logs.join("\n")).not.toContain("@example.com");
  });

  it("à l'échéance, toute autre issue que 404 USER_NOT_FOUND (5xx, configuration) : jamais de suppression", async () => {
    const down = await createTournament("1995-06-14");
    const misconfigured = await createTournament("1995-06-13");
    for (const id of [down.id, misconfigured.id]) {
      await prisma.tournament.update({ where: { id }, data: { closeReminderRecipientNotFoundAt: REMINDER_RUN } });
    }
    const notifier = fakeNotifier({ [down.id]: SMTP_DOWN, [misconfigured.id]: BAD_TOKEN });

    // Deux passages : le second n'a plus de configuration valable pour l'un et reste en panne pour l'autre.
    for (const now of [NO_REMINDER_DEADLINE_RUN, new Date(NO_REMINDER_DEADLINE_RUN.getTime() + 24 * H)]) {
      const report = await purge({ notifier, now });
      expect(report.deletedWithoutReminder).toBe(0);
      expect(entryFor(report, down.id)?.outcome).toMatch(/^REMINDER_(FAILED|NOT_ATTEMPTED)$/);
      expect(entryFor(report, misconfigured.id)?.outcome).toMatch(/^REMINDER_(CONFIGURATION_ERROR|NOT_ATTEMPTED)$/);
    }
    expect(await prisma.tournament.count({ where: { id: { in: [down.id, misconfigured.id] } } })).toBe(2);
  });

  it("premier 404 constaté seulement après l'échéance (SterPlatform en panne avant) : horodaté, supprimé au passage suivant seulement", async () => {
    const t = await createTournament("1995-06-14");
    let outcome: CloseReminderSendResult = SMTP_DOWN;
    const notifier = fakeNotifier({ [t.id]: () => outcome });

    await purge({ notifier, now: REMINDER_RUN });
    expect(await notFoundOf(t.id)).toBeNull();

    outcome = NOT_FOUND;
    const first = await purge({ notifier, now: NO_REMINDER_DEADLINE_RUN });
    expect(entryFor(first, t.id)?.outcome).toBe("REMINDER_RECIPIENT_NOT_FOUND");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(1);

    const next = await purge({ notifier, now: new Date(NO_REMINDER_DEADLINE_RUN.getTime() + 24 * H) });
    expect(entryFor(next, t.id)?.outcome).toBe("DELETED_WITHOUT_REMINDER");
    expect(await prisma.tournament.count({ where: { id: t.id } })).toBe(0);
  });

  it("tournoi clôturé après le constat : ni balayé ni supprimé ; revérification sous verrou", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS");
    const tree = await createFullTree(t.id);
    await prisma.tournament.update({ where: { id: t.id }, data: { closeReminderRecipientNotFoundAt: REMINDER_RUN, status: "FINISHED" } });

    const report = await purge({ notifier: fakeNotifier({ [t.id]: NOT_FOUND }), now: NO_REMINDER_DEADLINE_RUN });
    expect(entryFor(report, t.id)).toBeUndefined();
    // Course simulée : classé « à supprimer » par le balayage, clôturé avant la transaction.
    const result = await deleteUnfinishedTournamentWithoutReminderIfDue(t.id, NO_REMINDER_DEADLINE_RUN);
    expect(result.deleted).toBe(false);
    expect(Object.values(await remainingRows(t.id, tree)).every((n) => n > 0)).toBe(true);
  });

  it("tournoi reporté après le constat : l'ancien 404 ne vaut plus, cycle neuf à la nouvelle J+1", async () => {
    const t = await createTournament("1995-06-14");
    await prisma.tournament.update({ where: { id: t.id }, data: { closeReminderRecipientNotFoundAt: REMINDER_RUN, date: day("1995-06-20") } });
    const notifier = fakeNotifier({ [t.id]: NOT_FOUND });

    const before = await purge({ notifier, now: NO_REMINDER_DEADLINE_RUN });
    expect(entryFor(before, t.id)).toBeUndefined();
    // Sous verrou aussi : la suppression sans rappel est refusée.
    expect((await deleteUnfinishedTournamentWithoutReminderIfDue(t.id, new Date("1995-06-30T04:00:00.000Z"))).deleted).toBe(false);

    // Nouvelle J+1 (21/06) : nouvel essai, nouveau constat, pas de suppression avant 23/06 00:00 UTC.
    const newJ1 = new Date("1995-06-21T04:00:00.000Z");
    const again = await purge({ notifier, now: newJ1 });
    expect(entryFor(again, t.id)?.outcome).toBe("REMINDER_RECIPIENT_NOT_FOUND");
    expect((await notFoundOf(t.id))?.toISOString()).toBe(newJ1.toISOString());
    const due = await purge({ notifier, now: new Date("1995-06-23T04:00:00.000Z") });
    expect(entryFor(due, t.id)?.outcome).toBe("DELETED_WITHOUT_REMINDER");
  });

  it("dry-run à l'échéance : annonce la suppression sans rappel, n'envoie rien, n'écrit rien", async () => {
    const t = await createTournament("1995-06-14", "IN_PROGRESS");
    const tree = await createFullTree(t.id);
    await prisma.tournament.update({ where: { id: t.id }, data: { closeReminderRecipientNotFoundAt: REMINDER_RUN } });
    const notifier = fakeNotifier({ [t.id]: NOT_FOUND });
    const logs: string[] = [];

    const report = await purge({ notifier, now: NO_REMINDER_DEADLINE_RUN, dryRun: true, log: (m) => logs.push(m) });

    expect(entryFor(report, t.id)?.outcome).toBe("DELETION_WITHOUT_REMINDER_WOULD_RUN");
    expect(entryFor(report, t.id)?.counts?.registrations).toBe(2);
    expect(notifier.send).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(Object.values(await remainingRows(t.id, tree)).every((n) => n > 0)).toBe(true);
    expect(logs.find((l) => l.includes(t.id))).toContain("SERAIT SUPPRIMÉ SANS RAPPEL");
  });
});

describe("purgeUnfinishedTournaments — dry-run (vrai PostgreSQL)", () => {
  it("liste rappels et suppressions sans rien envoyer ni écrire", async () => {
    const toRemind = await createTournament("1995-06-14");
    const toDelete = await createTournament("1995-06-10", "IN_PROGRESS", day("1995-06-11"));
    const tree = await createFullTree(toDelete.id);
    const notifier = fakeNotifier();
    const logs: string[] = [];

    const report = await purge({ notifier, now: REMINDER_RUN, dryRun: true, log: (m) => logs.push(m) });

    expect(entryFor(report, toRemind.id)?.outcome).toBe("REMINDER_WOULD_SEND");
    expect(entryFor(report, toDelete.id)?.outcome).toBe("DELETION_WOULD_RUN");
    expect(entryFor(report, toDelete.id)?.counts?.matchSetThrows).toBe(1);
    expect(notifier.send).not.toHaveBeenCalled();
    expect(await reminderOf(toRemind.id)).toBeNull();
    expect(Object.values(await remainingRows(toDelete.id, tree)).every((n) => n > 0)).toBe(true);
    expect(report.remindersSent + report.deleted).toBe(0);
    // Journal : identifiant du tournoi, jamais son nom ni les coordonnées des joueurs.
    const line = logs.find((l) => l.includes(toDelete.id))!;
    expect(line).toContain("SERAIT SUPPRIMÉ");
    expect(line).not.toContain("Tournoi jamais terminé");
    expect(logs.join("\n")).not.toContain("@example.com");
  });
});
