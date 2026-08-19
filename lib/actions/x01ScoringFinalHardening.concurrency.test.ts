import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import {
  dbCreateTournament,
  dbRecordThrow,
  dbCancelLastThrow,
  dbArbitrateMatch,
  bulkCreateMatchesTx,
  withTournamentLock,
} from "@/lib/db/tournament";

/**
 * DO-SCORING-003 — clôture des deux derniers défauts hauts identifiés par l'audit Codex
 * post-DO-SCORING-002 : (1) un replay de commande déjà appliquée ne doit plus jamais écrire en
 * base, même pour une ancienne volée de checkout encore non annulée — sinon un retry tardif
 * peut réécrire un vainqueur déjà corrigé par arbitrage ; (2) une fléchette de fermeture n'est
 * acceptée que si le "préfixe" de la volée (le reste avant cette fléchette) est réellement
 * réalisable avec au plus deux fléchettes légales, jamais une simple borne 0..120. Même
 * discipline PostgreSQL réel que les fichiers précédents (DO-SPORT-001/002, DO-SCORING-001/002).
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.matchSetThrow.deleteMany({ where: { matchSet: { match: { tournamentId: { in: createdTournamentIds } } } } });
    await prisma.matchSet.deleteMany({ where: { match: { tournamentId: { in: createdTournamentIds } } } });
    await prisma.match.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.round.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.registration.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function makeTournament(overrides: Partial<Parameters<typeof dbCreateTournament>[1]> = {}) {
  const t = await dbCreateTournament(
    "user-x01-final-hardening",
    {
      name: "Tournoi X01 clôture finale",
      date: "2026-09-01",
      location: "Salle des fêtes",
      max_players: 32,
      entry_fee: 0,
      nb_pools: 1,
      nb_boards: 4,
      advancement_per_pool: 1,
      players_per_team: 1,
      registration_mode: "ONLINE",
      payment_mode: "ONSITE",
      scoring_mode: "TRADITIONAL",
      ...overrides,
    },
    randomUUID(),
  );
  createdTournamentIds.push(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  return t;
}

async function makePlayer(tournamentId: string, name: string) {
  return prisma.registration.create({
    data: {
      tournamentId,
      playerName: name,
      playerEmail: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID()}@example.com`,
      playerNames: [name],
      status: "PAID",
    },
  });
}

async function makeRound(
  tournamentId: string,
  order: number,
  gameType = "40",
  finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER" = "DOUBLE",
) {
  const r = await prisma.round.create({
    data: { tournamentId, roundOrder: order, gameType, entryType: "SINGLE", finishType },
    select: { id: true },
  });
  return r.id;
}

async function makeBracketMatch(
  tournamentId: string,
  p1Id: string,
  p2Id: string,
  roundIds: string[],
  opts: { boardNumber: number; status: "PENDING" | "IN_PROGRESS" },
) {
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1Id,
      player2Id: p2Id,
      bracketRound: 1,
      bracketPosition: 0,
      boardNumber: opts.boardNumber,
      status: opts.status,
      roundIds,
      bracketType: "SINGLE",
    }]),
  );
  const match = await prisma.match.findFirstOrThrow({ where: { tournamentId, player1Id: p1Id, player2Id: p2Id } });
  const rawSets = await prisma.matchSet.findMany({ where: { matchId: match.id }, include: { round: true } });
  const sets = rawSets.sort((a, b) => a.round.roundOrder - b.round.roundOrder);
  return { match, sets };
}

/** Manche 1 (checkout testé) + manche 2 sentinelle jamais jouée : le checkout de la manche 1 ne
 * finalise donc jamais tout le match — utile pour isoler l'effet du replay sur LE set seul. */
async function makeTwoRoundFixture(finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER" = "DOUBLE") {
  const t = await makeTournament({ nb_boards: 2 });
  const p1 = await makePlayer(t.id, "Alice");
  const p2 = await makePlayer(t.id, "Bob");
  const round1 = await makeRound(t.id, 1, "40", finishType);
  const round2 = await makeRound(t.id, 2, "501", "DOUBLE");
  const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2], { boardNumber: 1, status: "IN_PROGRESS" });
  return { t, p1, p2, match, setId: sets[0].id };
}

/** Manche unique : le checkout finalise à la fois la manche ET le match — nécessaire pour tester
 * un arbitrage sur `Match.winnerId` (le test B doit pouvoir vérifier un vrai vainqueur de match). */
async function makeSingleRoundFixture(finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER" = "DOUBLE") {
  const t = await makeTournament({ nb_boards: 2 });
  const p1 = await makePlayer(t.id, "Alice");
  const p2 = await makePlayer(t.id, "Bob");
  const roundId = await makeRound(t.id, 1, "40", finishType);
  const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
  return { t, p1, p2, match, setId: sets[0].id };
}

describe("Défaut 1 — tout replay est strictement sans écriture (DO-SCORING-003)", () => {
  it("A — replay d'un checkout actif normal : aucun changement DB au second appel, aucun double effet sportif", async () => {
    const { match, setId, t } = await makeTwoRoundFixture("DOUBLE");
    const clientRequestId = randomUUID();

    const checkout = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchSetFinished).toBe(true);

    const setBefore = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchBefore = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const throwBefore = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });

    const retry = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in retry) throw new Error(retry.error);
    expect(retry.throwId).toBe(checkout.throwId);
    expect(retry.cancelled).toBe(false);

    // Comparaison stricte, updatedAt compris : la moindre écriture (même idempotente au niveau
    // des valeurs) ferait bouger `updatedAt` — la seule façon de le garder identique est de
    // n'avoir RIEN écrit.
    const setAfter = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const throwAfter = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });
    expect(setAfter).toEqual(setBefore);
    expect(matchAfter).toEqual(matchBefore);
    expect(throwAfter).toEqual(throwBefore);

    expect(await prisma.matchSetThrow.count({ where: { matchSetId: setId } })).toBe(1);
  });

  it("B — replay après arbitrage : le vainqueur retenu reste celui de l'arbitrage, jamais réécrit par le retry de l'ancien checkout", async () => {
    const { match, setId, t, p1: playerA, p2: playerB } = await makeSingleRoundFixture("DOUBLE");
    const clientRequestIdA = randomUUID();

    const checkoutA = await dbRecordThrow(setId, t.id, 1, 40, clientRequestIdA, { segment: 20, multiplier: 2 });
    if ("error" in checkoutA) throw new Error(checkoutA.error);
    expect(checkoutA.matchFinished).toBe(true);

    const matchAfterCheckout = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfterCheckout.winnerId).toBe(playerA.id);
    expect(matchAfterCheckout.status).toBe("FINISHED");

    // Correction par arbitrage organisateur en faveur de B.
    const arbitrate = await dbArbitrateMatch(match.id, t.id, [{ setId, winnerId: playerB.id }]);
    expect(arbitrate.error).toBeUndefined();

    const setAfterArbitrate = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchAfterArbitrate = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(setAfterArbitrate.winnerId).toBe(playerB.id);
    expect(matchAfterArbitrate.winnerId).toBe(playerB.id);
    const boardAfterArbitrate = matchAfterArbitrate.boardNumber;
    const matchUpdatedAtAfterArbitrate = matchAfterArbitrate.updatedAt;
    const playerALivesBefore = (await prisma.registration.findUniqueOrThrow({ where: { id: playerA.id } })).lives;
    const playerBLivesBefore = (await prisma.registration.findUniqueOrThrow({ where: { id: playerB.id } })).lives;

    // Rejeu tardif de l'ANCIENNE commande de checkout de A (même clientRequestId) — un appel
    // réseau de A resté en vol, reçu après la correction par arbitrage.
    const replay = await dbRecordThrow(setId, t.id, 1, 40, clientRequestIdA, { segment: 20, multiplier: 2 });
    if ("error" in replay) throw new Error(replay.error);
    expect(replay.throwId).toBe(checkoutA.throwId);

    // Rien n'a changé : vainqueur du set toujours B, vainqueur du match inchangé, cible
    // inchangée, aucune vie modifiée, `updatedAt` du match strictement identique (preuve directe
    // qu'aucune écriture n'a eu lieu).
    const setFinal = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchFinal = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(setFinal.winnerId).toBe(playerB.id);
    expect(matchFinal.winnerId).toBe(playerB.id);
    expect(matchFinal.boardNumber).toBe(boardAfterArbitrate);
    expect(matchFinal.updatedAt.getTime()).toBe(matchUpdatedAtAfterArbitrate.getTime());
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: playerA.id } })).lives).toBe(playerALivesBefore);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: playerB.id } })).lives).toBe(playerBLivesBefore);

    // Aucun match de tour suivant ou autre effet d'avancement supplémentaire.
    expect(await prisma.match.count({ where: { tournamentId: t.id } })).toBe(1);
  });

  it("C — replay après annulation : conserve le comportement déjà corrigé, aucun effet (DO-SCORING-002)", async () => {
    const { setId, t } = await makeTwoRoundFixture("DOUBLE");
    const checkout = await dbRecordThrow(setId, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);

    const cancel = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(cancel.error).toBeUndefined();

    const setBefore = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const throwClientRequestId = (await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } })).clientRequestId;

    const replay = await dbRecordThrow(setId, t.id, 1, 40, throwClientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in replay) throw new Error(replay.error);
    expect(replay.cancelled).toBe(true);
    expect(replay.matchSetFinished).toBe(false);
    expect(replay.matchFinished).toBe(false);

    const setAfter = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    expect(setAfter).toEqual(setBefore);
    expect((await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } })).cancelledAt).not.toBeNull();
  });

  it("D — dix rejeux successifs puis dix rejeux réellement concurrents d'une même commande historique active restent strictement sans effet", async () => {
    const { match, setId, t } = await makeTwoRoundFixture("DOUBLE");
    const clientRequestId = randomUUID();
    const checkout = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);

    const matchSnapshot = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const setSnapshot = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });

    for (let i = 0; i < 10; i++) {
      const r = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
      if ("error" in r) throw new Error(r.error);
      expect(r.throwId).toBe(checkout.throwId);
    }

    const concurrentResults = await Promise.all(
      Array.from({ length: 10 }, () => dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 })),
    );
    for (const r of concurrentResults) {
      if ("error" in r) throw new Error(r.error);
      expect(r.throwId).toBe(checkout.throwId);
    }

    const matchFinal = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const setFinal = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    expect(matchFinal).toEqual(matchSnapshot);
    expect(setFinal).toEqual(setSnapshot);
    expect(await prisma.matchSetThrow.count({ where: { matchSetId: setId } })).toBe(1);
  });
});

describe("Défaut 2 — faisabilité réelle du préfixe de la volée de checkout (DO-SCORING-003)", () => {
  async function makeCheckoutFixture(gameType: string, finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER" = "DOUBLE") {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, gameType, finishType);
    const round2 = await makeRound(t.id, 2, "501", "DOUBLE"); // manche sentinelle, jamais jouée
    const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2], { boardNumber: 1, status: "IN_PROGRESS" });
    return { t, match, setId: sets[0].id };
  }

  it("volée de 180 fermée par un simple D1 (préfixe 178, > 120, strictement impossible) : bust, jamais une victoire", async () => {
    const { t, setId } = await makeCheckoutFixture("180", "DOUBLE");
    const r = await dbRecordThrow(setId, t.id, 1, 180, randomUUID(), { segment: 1, multiplier: 2 });
    if ("error" in r) throw new Error(r.error);
    expect(r.bust).toBe(true);
    expect(r.matchSetFinished).toBe(false);
    expect((await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } })).winnerId).toBeNull();
  });

  it("volée de 170 fermée par bull double (50, préfixe 120 = T20+T20, réalisable) : acceptée", async () => {
    const { t, setId } = await makeCheckoutFixture("170", "DOUBLE");
    const r = await dbRecordThrow(setId, t.id, 1, 170, randomUUID(), { segment: 25, multiplier: 2 });
    if ("error" in r) throw new Error(r.error);
    expect(r.bust).toBe(false);
    expect(r.matchSetFinished).toBe(true);
  });

  it("un préfixe ≤120 mais réellement impossible (119) est refusé : bust", async () => {
    // scoreEntered=159, fermeture D20=40, préfixe=119 — dans la plage ≤120 mais aucune paire de
    // fléchettes légales ne somme à 119 (voir lib/utils/x01.test.ts pour la preuve exhaustive).
    const { t, setId } = await makeCheckoutFixture("159", "DOUBLE");
    const r = await dbRecordThrow(setId, t.id, 1, 159, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in r) throw new Error(r.error);
    expect(r.bust).toBe(true);
    expect(r.matchSetFinished).toBe(false);
  });

  it("idempotence stricte inchangée : compare toujours joueur, score, segment et multiplicateur (y compris pour un bust de préfixe)", async () => {
    const { t, setId } = await makeCheckoutFixture("180", "DOUBLE");
    const clientRequestId = randomUUID();
    const first = await dbRecordThrow(setId, t.id, 1, 180, clientRequestId, { segment: 1, multiplier: 2 });
    if ("error" in first) throw new Error(first.error);
    expect(first.bust).toBe(true);

    // Rejeu exact : replay pur, toujours bust, aucune écriture supplémentaire.
    const replay = await dbRecordThrow(setId, t.id, 1, 180, clientRequestId, { segment: 1, multiplier: 2 });
    if ("error" in replay) throw new Error(replay.error);
    expect(replay.throwId).toBe(first.throwId);
    expect(await prisma.matchSetThrow.count({ where: { matchSetId: setId } })).toBe(1);

    // Même ID, fléchette différente → refus explicite (comparaison d'idempotence inchangée).
    const different = await dbRecordThrow(setId, t.id, 1, 180, clientRequestId, { segment: 2, multiplier: 1 });
    expect("error" in different).toBe(true);
    expect(await prisma.matchSetThrow.count({ where: { matchSetId: setId } })).toBe(1);
  });
});
