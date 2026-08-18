import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import {
  dbCreateTournament,
  dbConfirmWinner,
  dbMarkWinnerDirect,
  dbUpdateTournamentStatus,
  dbArbitrateMatch,
  bulkCreateMatchesTx,
  withTournamentLock,
} from "@/lib/db/tournament";
import { doAdvanceToNextRound, generateBracket } from "@/lib/actions/bracket";
import { doAdvanceQuickTournament } from "@/lib/actions/quickTournament";

// DO-SPORT-002 — pour tester generateBracket() (le vrai code de "génération initiale", pas une
// réimplémentation) sans dépendre du SSO/cookies : seule la frontière d'autorisation est
// remplacée par une lecture DB directe, la logique métier de generateBracket() elle-même tourne
// intégralement, contre le vrai Postgres.
vi.mock("@/lib/actions/access", async () => {
  const { dbGetTournament } = await import("@/lib/db/tournament");
  return {
    getOwnedTournament: async (id: string) => {
      const t = await dbGetTournament(id);
      if (!t) throw new Error("Tournoi introuvable (mock getOwnedTournament).");
      return t;
    },
  };
});

/**
 * DO-SPORT-001 — preuves réelles, contre un vrai PostgreSQL (jamais mocké), des garanties
 * d'atomicité du moteur sportif : finalisation de match, libération/affectation de cible,
 * progression de tour (standard et rapide), clôture du tournoi. Même discipline que
 * lib/rateLimit.test.ts (SEC-005) et lib/db/tournament.concurrency.test.ts : Promise.all sur de
 * vrais appels aux fonctions réelles (jamais une simulation séquentielle, jamais une
 * réimplémentation "miroir" de la logique) — un mock ne peut pas prouver qu'un verrou Postgres
 * tient sous contention réelle. Chaque test vérifie l'état final réel en base, pas seulement
 * la valeur de retour des fonctions appelées.
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    // Ordre imposé par les contraintes FK par défaut de Prisma (RESTRICT, jamais CASCADE, sur
    // match_sets.round_id / match_sets.winner_id / matches.player1_id|player2_id|winner_id) :
    // match_sets avant matches et rounds, puis registrations, avant le tournoi lui-même — un
    // simple `tournament.deleteMany` échoue sinon ("violates RESTRICT setting").
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
    "user-sport-engine",
    {
      name: "Tournoi moteur sportif",
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
      scoring_mode: "ELECTRONIC",
      ...overrides,
    },
    randomUUID(),
  );
  createdTournamentIds.push(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  return t;
}

async function makePlayer(tournamentId: string, name: string, lives = 2) {
  return prisma.registration.create({
    data: {
      tournamentId,
      playerName: name,
      playerEmail: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID()}@example.com`,
      playerNames: [name],
      status: "PAID",
      lives,
    },
  });
}

async function makeRound(tournamentId: string) {
  const round = await prisma.round.create({
    data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" },
    select: { id: true },
  });
  return round.id;
}

/** Mode rapide : doAdvanceQuickTournament (via dbGetQuickTournamentRoundIds) exige les 3
 * manches 501/Cricket/701 simultanément, contrairement au mode standard qui n'en a besoin
 * que d'une — voir generateQuickBracket qui les crée toutes via dbCreateQuickTournamentRounds. */
async function makeQuickRounds(tournamentId: string) {
  const [r501] = await Promise.all([
    prisma.round.create({ data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
    prisma.round.create({ data: { tournamentId, roundOrder: 2, gameType: "CRICKET", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
    prisma.round.create({ data: { tournamentId, roundOrder: 3, gameType: "701", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
  ]);
  return r501.id; // les fixtures de test utilisent le format 501 par défaut
}

async function makeMatch(
  tournamentId: string,
  roundId: string,
  p1: string,
  p2: string,
  opts: {
    boardNumber: number;
    status: "PENDING" | "IN_PROGRESS";
    bracketRound?: number;
    bracketPosition?: number;
    bracketType?: "SINGLE" | "WINNERS" | "LOSERS" | "GRAND_FINAL";
  },
) {
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1,
      player2Id: p2,
      bracketRound: opts.bracketRound ?? 1,
      bracketPosition: opts.bracketPosition ?? 0,
      boardNumber: opts.boardNumber,
      status: opts.status,
      roundIds: [roundId],
      bracketType: opts.bracketType ?? "SINGLE",
    }]),
  );
  return prisma.match.findFirstOrThrow({
    where: { tournamentId, player1Id: p1, player2Id: p2, bracketRound: opts.bracketRound ?? 1, bracketPosition: opts.bracketPosition ?? 0 },
    include: { sets: true },
  });
}

/** Marque un match FINISHED directement en base (sans passer par dbMarkWinnerDirect), pour
 * préparer un fixture "déjà terminé" sans déclencher la logique de libération de cible. */
async function forceFinishMatch(matchId: string, winnerId: string) {
  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED", winnerId } });
}

describe("dbConfirmWinner/dbMarkWinnerDirect — double validation et rejeu (DO-SPORT-001, Étape 3, tests §1/§10/§11)", () => {
  it("§1 — double confirmation concurrente du même set (double-clic) : une seule réussit, l'autre est explicitement refusée, le match n'est finalisé qu'une fois", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id);
    const match = await makeMatch(t.id, roundId, p1.id, p2.id, { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = match.sets[0].id;

    // Alice a déjà proposé et validé son propre côté — il ne reste que la confirmation de Bob.
    await prisma.matchSet.update({ where: { id: setId }, data: { winnerId: p1.id, validatedP1: true } });

    const [r1, r2] = await Promise.all([
      dbConfirmWinner(setId, 2),
      dbConfirmWinner(setId, 2),
    ]);

    const succeeded = [r1, r2].filter((r) => !r.error);
    const refused = [r1, r2].filter((r) => r.error);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].error).toMatch(/déjà proposé/i);
    expect(succeeded[0].matchFinished).toBe(true);

    const finalMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(finalMatch.status).toBe("FINISHED");
    expect(finalMatch.winnerId).toBe(p1.id);
  });

  it("§10/§11 — rejeu de dbMarkWinnerDirect après succès (retry réseau) : idempotent, jamais une seconde libération de cible", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const p3 = await makePlayer(t.id, "Carl");
    const p4 = await makePlayer(t.id, "Dana");
    const roundId = await makeRound(t.id);
    const match = await makeMatch(t.id, roundId, p1.id, p2.id, { boardNumber: 1, status: "IN_PROGRESS" });
    const pending = await makeMatch(t.id, roundId, p3.id, p4.id, { boardNumber: 0, status: "PENDING", bracketPosition: 1 });
    const setId = match.sets[0].id;

    const first = await dbMarkWinnerDirect(setId, p1.id);
    expect(first.matchFinished).toBe(true);

    const afterFirst = await prisma.match.findUniqueOrThrow({ where: { id: pending.id } });
    expect(afterFirst.status).toBe("IN_PROGRESS");
    expect(afterFirst.boardNumber).toBe(1);

    // Rejeu exact de la même commande (même setId, même vainqueur) — simulateur de retry réseau
    // après un succès dont la réponse s'est perdue.
    const retry = await dbMarkWinnerDirect(setId, p1.id);
    expect(retry.matchFinished).toBeFalsy();

    // Aucun effet supplémentaire : le match promu reste sur sa cible, jamais réaffecté ailleurs
    // ni promu une seconde fois.
    const afterRetry = await prisma.match.findUniqueOrThrow({ where: { id: pending.id } });
    expect(afterRetry.status).toBe("IN_PROGRESS");
    expect(afterRetry.boardNumber).toBe(1);
  });
});

describe("Finalisation concurrente et affectation de cible (DO-SPORT-001, Étape 4, tests §2/§3/§4/§5)", () => {
  it("deux matchs terminés simultanément sur deux cibles distinctes, deux matchs en attente : chaque cible libérée reçoit un match différent, jamais le même deux fois", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const [pA1, pA2, pB1, pB2, pC1, pC2, pD1, pD2] = await Promise.all(
      ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"].map((n) => makePlayer(t.id, n)),
    );
    const roundId = await makeRound(t.id);

    const matchA = await makeMatch(t.id, roundId, pA1.id, pA2.id, { boardNumber: 1, status: "IN_PROGRESS", bracketPosition: 0 });
    const matchB = await makeMatch(t.id, roundId, pB1.id, pB2.id, { boardNumber: 2, status: "IN_PROGRESS", bracketPosition: 1 });
    const matchC = await makeMatch(t.id, roundId, pC1.id, pC2.id, { boardNumber: 0, status: "PENDING", bracketPosition: 2 });
    const matchD = await makeMatch(t.id, roundId, pD1.id, pD2.id, { boardNumber: 0, status: "PENDING", bracketPosition: 3 });

    const [rA, rB] = await Promise.all([
      dbMarkWinnerDirect(matchA.sets[0].id, pA1.id),
      dbMarkWinnerDirect(matchB.sets[0].id, pB1.id),
    ]);
    expect(rA.matchFinished).toBe(true);
    expect(rB.matchFinished).toBe(true);

    const [finalA, finalB, finalC, finalD] = await Promise.all([
      prisma.match.findUniqueOrThrow({ where: { id: matchA.id } }),
      prisma.match.findUniqueOrThrow({ where: { id: matchB.id } }),
      prisma.match.findUniqueOrThrow({ where: { id: matchC.id } }),
      prisma.match.findUniqueOrThrow({ where: { id: matchD.id } }),
    ]);

    expect(finalA.status).toBe("FINISHED");
    expect(finalB.status).toBe("FINISHED");

    // Les deux matchs en attente ont chacun reçu une cible distincte parmi {1, 2} — jamais la
    // même cible aux deux, jamais laissés tous les deux en attente.
    const promoted = [finalC, finalD].filter((m) => m.status === "IN_PROGRESS");
    expect(promoted).toHaveLength(2);
    const boardsUsed = promoted.map((m) => m.boardNumber).sort();
    expect(boardsUsed).toEqual([1, 2]);
    expect(new Set(boardsUsed).size).toBe(2); // jamais la même cible affectée deux fois

    // Invariant DB direct : jamais deux matchs IN_PROGRESS sur la même cible réelle pour ce tournoi.
    const activeByBoard = await prisma.match.groupBy({
      by: ["boardNumber"],
      where: { tournamentId: t.id, status: "IN_PROGRESS", boardNumber: { gt: 0 } },
      _count: { id: true },
    });
    for (const row of activeByBoard) {
      expect(row._count.id).toBe(1);
    }
  });

  it("forte concurrence : 4 matchs terminés simultanément sur 4 cibles, 4 matchs en attente — aucune cible n'héberge jamais deux matchs actifs, aucun match affecté deux fois", async () => {
    const t = await makeTournament({ nb_boards: 4 });
    const names = Array.from({ length: 16 }, (_, i) => `P${i}`);
    const players = await Promise.all(names.map((n) => makePlayer(t.id, n)));
    const roundId = await makeRound(t.id);

    const activeMatches = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        makeMatch(t.id, roundId, players[i * 2].id, players[i * 2 + 1].id, {
          boardNumber: i + 1,
          status: "IN_PROGRESS",
          bracketPosition: i,
        }),
      ),
    );
    const pendingMatches = await Promise.all(
      [4, 5, 6, 7].map((i) =>
        makeMatch(t.id, roundId, players[i * 2].id, players[i * 2 + 1].id, {
          boardNumber: 0,
          status: "PENDING",
          bracketPosition: i,
        }),
      ),
    );

    const results = await Promise.all(
      activeMatches.map((m) => dbMarkWinnerDirect(m.sets[0].id, m.player1Id)),
    );
    expect(results.every((r) => r.matchFinished)).toBe(true);

    const finalPending = await prisma.match.findMany({
      where: { id: { in: pendingMatches.map((m) => m.id) } },
    });
    const promoted = finalPending.filter((m) => m.status === "IN_PROGRESS");
    expect(promoted).toHaveLength(4);
    const boards = promoted.map((m) => m.boardNumber).sort();
    expect(boards).toEqual([1, 2, 3, 4]); // les 4 cibles libérées, chacune une fois

    const activeByBoard = await prisma.match.groupBy({
      by: ["boardNumber"],
      where: { tournamentId: t.id, status: "IN_PROGRESS", boardNumber: { gt: 0 } },
      _count: { id: true },
    });
    expect(activeByBoard.every((row) => row._count.id === 1)).toBe(true);
    expect(activeByBoard).toHaveLength(4);
  });
});

describe("doAdvanceToNextRound — progression de tour standard (DO-SPORT-001, Étape 5, tests §6/§7)", () => {
  it("§6 — deux matchs du même tour terminés simultanément déclenchent deux appels concurrents : le tour suivant n'est créé qu'une seule fois", async () => {
    const t = await makeTournament({ nb_boards: 4 });
    const [p1, p2, p3, p4] = await Promise.all(["A", "B", "C", "D"].map((n) => makePlayer(t.id, n)));
    const roundId = await makeRound(t.id);

    const m1 = await makeMatch(t.id, roundId, p1.id, p2.id, { boardNumber: 1, status: "IN_PROGRESS", bracketRound: 1, bracketPosition: 0 });
    const m2 = await makeMatch(t.id, roundId, p3.id, p4.id, { boardNumber: 2, status: "IN_PROGRESS", bracketRound: 1, bracketPosition: 1 });
    await forceFinishMatch(m1.id, p1.id);
    await forceFinishMatch(m2.id, p3.id);

    const results = await Promise.all([
      doAdvanceToNextRound(t.id, 1),
      doAdvanceToNextRound(t.id, 1),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);

    const round2Matches = await prisma.match.findMany({
      where: { tournamentId: t.id, bracketRound: 2, poolId: null },
    });
    expect(round2Matches).toHaveLength(1);
    expect([round2Matches[0].player1Id, round2Matches[0].player2Id].sort()).toEqual([p1.id, p3.id].sort());
  });

  it("§7 — dernier match du tournoi terminé, avancement déclenché deux fois concurremment : le tournoi clôture exactement une fois", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const [p1, p2] = await Promise.all(["Finaliste A", "Finaliste B"].map((n) => makePlayer(t.id, n)));
    const roundId = await makeRound(t.id);
    const finalMatch = await makeMatch(t.id, roundId, p1.id, p2.id, { boardNumber: 1, status: "IN_PROGRESS", bracketRound: 3, bracketPosition: 0 });
    await forceFinishMatch(finalMatch.id, p1.id);

    const results = await Promise.all([
      doAdvanceToNextRound(t.id, 3),
      doAdvanceToNextRound(t.id, 3),
    ]);
    expect(results.every((r) => r.finished === true)).toBe(true);

    const finalTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(finalTournament.status).toBe("FINISHED");

    // Aucun match supplémentaire créé par la seconde exécution.
    const allMatches = await prisma.match.findMany({ where: { tournamentId: t.id, poolId: null } });
    expect(allMatches).toHaveLength(1);
  });
});

describe("dbUpdateTournamentStatus — clôture unique sous concurrence (DO-SPORT-001, Étape 6, test §8)", () => {
  it("deux transitions concurrentes IN_PROGRESS → FINISHED : une seule écriture réelle, l'autre échoue explicitement, jamais une incohérence silencieuse", async () => {
    const t = await makeTournament();

    const results = await Promise.allSettled([
      dbUpdateTournamentStatus(t.id, "FINISHED"),
      dbUpdateTournamentStatus(t.id, "FINISHED"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/changé entre-temps/i);

    const final = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(final.status).toBe("FINISHED");
  });
});

describe("doAdvanceQuickTournament — mode rapide (DO-SPORT-001, Étape 7, tests §9/§12)", () => {
  async function makeQuickTournament() {
    return makeTournament({ nb_boards: 2, players_per_team: 1 });
  }

  it("§9 — perte de vie appliquée exactement une fois même si l'avancement est rejoué/concurrent pour le même match terminé", async () => {
    const t = await makeQuickTournament();
    await prisma.tournament.update({ where: { id: t.id }, data: { quickMode: true } });
    const p1 = await makePlayer(t.id, "Winner", 2);
    const p2 = await makePlayer(t.id, "Loser", 2);
    const roundId = await makeQuickRounds(t.id);
    const match = await makeMatch(t.id, roundId, p1.id, p2.id, {
      boardNumber: 1, status: "IN_PROGRESS", bracketRound: 1, bracketPosition: 0, bracketType: "WINNERS",
    });
    await forceFinishMatch(match.id, p1.id);

    const results = await Promise.all([
      doAdvanceQuickTournament(t.id, match.id),
      doAdvanceQuickTournament(t.id, match.id),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);

    const loserFinal = await prisma.registration.findUniqueOrThrow({ where: { id: p2.id } });
    expect(loserFinal.lives).toBe(1); // 2 - 1, jamais 0 (qui signifierait une double décrémentation)

    const matchFinal = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchFinal.quickAdvanceProcessedAt).not.toBeNull();
  });

  it("§12 — scénario multi-cibles : plusieurs matchs de tournoi rapide terminés concurremment sur des cibles distinctes ne créent jamais de doublon de joueur dans deux nouveaux matchs", async () => {
    const t = await makeQuickTournament();
    await prisma.tournament.update({ where: { id: t.id }, data: { quickMode: true, nbBoards: 4 } });
    const names = ["W1a", "W1b", "W2a", "W2b", "W3a", "W3b", "W4a", "W4b"];
    const players = await Promise.all(names.map((n) => makePlayer(t.id, n, 2)));
    const roundId = await makeQuickRounds(t.id);

    const matches = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        makeMatch(t.id, roundId, players[i * 2].id, players[i * 2 + 1].id, {
          boardNumber: i + 1,
          status: "IN_PROGRESS",
          bracketRound: 1,
          bracketPosition: i,
          bracketType: "WINNERS",
        }),
      ),
    );
    await Promise.all(matches.map((m) => forceFinishMatch(m.id, m.player1Id)));

    const results = await Promise.all(matches.map((m) => doAdvanceQuickTournament(t.id, m.id)));
    expect(results.every((r) => !r.error)).toBe(true);

    // Chaque perdant a perdu exactement une vie.
    const losers = await prisma.registration.findMany({
      where: { id: { in: matches.map((m) => m.player2Id!) } },
    });
    expect(losers.every((l) => l.lives === 1)).toBe(true);

    // Aucun gagnant n'apparaît dans plus d'un nouveau match WB round 2 — jamais un joueur
    // apparié deux fois simultanément.
    const nextRoundMatches = await prisma.match.findMany({
      where: { tournamentId: t.id, bracketType: "WINNERS", bracketRound: 2 },
    });
    const playerAppearances = nextRoundMatches.flatMap((m) => [m.player1Id, m.player2Id].filter(Boolean));
    expect(new Set(playerAppearances).size).toBe(playerAppearances.length);

    // Invariant cible : jamais deux matchs actifs sur la même cible réelle.
    const activeByBoard = await prisma.match.groupBy({
      by: ["boardNumber"],
      where: { tournamentId: t.id, status: "IN_PROGRESS", boardNumber: { gt: 0 } },
      _count: { id: true },
    });
    expect(activeByBoard.every((row) => row._count.id === 1)).toBe(true);
  });
});

describe("File d'attente standard sans cible préaffectée (DO-SPORT-002, problème 1)", () => {
  it("génération initiale (generateBracket réel) : aucun match PENDING n'a de cible préaffectée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    await makeRound(t.id);
    await Promise.all(
      ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map((n) => makePlayer(t.id, n))
    );

    const result = await generateBracket(t.id);
    expect(result.error).toBeUndefined();

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id, poolId: null } });
    expect(matches).toHaveLength(4); // 8 joueurs, aucun bye

    const active = matches.filter((m) => m.status === "IN_PROGRESS");
    const pending = matches.filter((m) => m.status === "PENDING");
    expect(active).toHaveLength(2); // nb_boards = 2
    expect(pending).toHaveLength(2);
    expect(active.every((m) => m.boardNumber > 0)).toBe(true);
    // Le cœur de la régression DO-SPORT-002 : plus jamais de cible "réservée" sur un PENDING.
    expect(pending.every((m) => m.boardNumber === 0)).toBe(true);
  });

  it("§1/§2/§3/§4 — deux cibles occupées, cible 2 libérée avant cible 1 : finalisation réussie sans rollback, la cible réellement libérée est affectée au prochain PENDING", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const [pA1, pA2, pB1, pB2, pC1, pC2, pD1, pD2] = await Promise.all(
      ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"].map((n) => makePlayer(t.id, n))
    );
    const roundId = await makeRound(t.id);

    const matchA = await makeMatch(t.id, roundId, pA1.id, pA2.id, { boardNumber: 1, status: "IN_PROGRESS", bracketPosition: 0 });
    const matchB = await makeMatch(t.id, roundId, pB1.id, pB2.id, { boardNumber: 2, status: "IN_PROGRESS", bracketPosition: 1 });
    // Aucune cible préaffectée sur les PENDING — même le "premier" (matchC, créé en premier)
    // n'a jamais boardNumber=1 : c'est précisément l'ancien comportement qui provoquait le
    // rollback décrit par l'audit Codex (tentative d'activation sur une cible encore occupée).
    const matchC = await makeMatch(t.id, roundId, pC1.id, pC2.id, { boardNumber: 0, status: "PENDING", bracketPosition: 2 });
    const matchD = await makeMatch(t.id, roundId, pD1.id, pD2.id, { boardNumber: 0, status: "PENDING", bracketPosition: 3 });

    // Cible 2 se libère AVANT cible 1.
    const resultB = await dbMarkWinnerDirect(matchB.sets[0].id, pB1.id);
    expect(resultB.error).toBeUndefined(); // §3 — finalisation réussie, jamais de rollback
    expect(resultB.matchFinished).toBe(true);

    const promotedAfterB = await prisma.match.findFirst({
      where: { id: { in: [matchC.id, matchD.id] }, status: "IN_PROGRESS" },
    });
    expect(promotedAfterB).not.toBeNull();
    expect(promotedAfterB!.boardNumber).toBe(2); // §4 — affecté à la cible réellement libérée (2), jamais 1
    const remainingPendingId = promotedAfterB!.id === matchC.id ? matchD.id : matchC.id;

    // Cible 1 se libère ensuite.
    const resultA = await dbMarkWinnerDirect(matchA.sets[0].id, pA1.id);
    expect(resultA.error).toBeUndefined();
    expect(resultA.matchFinished).toBe(true);

    const lastPromoted = await prisma.match.findUniqueOrThrow({ where: { id: remainingPendingId } });
    expect(lastPromoted.status).toBe("IN_PROGRESS");
    expect(lastPromoted.boardNumber).toBe(1);

    // Invariant final : plus aucun match de ce tournoi n'est PENDING avec une cible non nulle.
    const stalePending = await prisma.match.count({
      where: { tournamentId: t.id, status: "PENDING", boardNumber: { gt: 0 } },
    });
    expect(stalePending).toBe(0);

    const activeByBoard = await prisma.match.groupBy({
      by: ["boardNumber"],
      where: { tournamentId: t.id, status: "IN_PROGRESS", boardNumber: { gt: 0 } },
      _count: { id: true },
    });
    expect(activeByBoard.every((row) => row._count.id === 1)).toBe(true);
  });

  it("§5/§6 — aucun match PENDING avec boardNumber > 0 après génération d'un tour standard, vérifié sur deux tours consécutifs", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const players = await Promise.all(
      Array.from({ length: 16 }, (_, i) => `P${i}`).map((n) => makePlayer(t.id, n))
    );
    const roundId = await makeRound(t.id);

    // Round 1 : 8 matchs (16 joueurs), les 2 premiers actifs (nb_boards=2), les 6 autres en
    // attente sans cible — reproduit exactement ce que produit désormais generateBracket().
    const r1 = await Promise.all(
      Array.from({ length: 8 }, (_, i) => i).map((i) =>
        makeMatch(t.id, roundId, players[i * 2].id, players[i * 2 + 1].id, {
          boardNumber: i < 2 ? i + 1 : 0,
          status: i < 2 ? "IN_PROGRESS" : "PENDING",
          bracketRound: 1,
          bracketPosition: i,
        })
      )
    );
    await Promise.all(r1.map((m) => forceFinishMatch(m.id, m.player1Id)));

    const advance1 = await doAdvanceToNextRound(t.id, 1);
    expect(advance1.error).toBeUndefined();

    const round2 = await prisma.match.findMany({ where: { tournamentId: t.id, bracketRound: 2, poolId: null } });
    expect(round2).toHaveLength(4);
    expect(round2.filter((m) => m.status === "IN_PROGRESS")).toHaveLength(2);
    expect(round2.filter((m) => m.status === "PENDING").every((m) => m.boardNumber === 0)).toBe(true);
    expect(round2.filter((m) => m.status === "IN_PROGRESS").every((m) => m.boardNumber > 0)).toBe(true);

    // Second tour consécutif : même invariant.
    await Promise.all(round2.map((m) => forceFinishMatch(m.id, m.player1Id)));
    const advance2 = await doAdvanceToNextRound(t.id, 2);
    expect(advance2.error).toBeUndefined();

    const round3 = await prisma.match.findMany({ where: { tournamentId: t.id, bracketRound: 3, poolId: null } });
    expect(round3.length).toBeGreaterThan(0);
    expect(round3.filter((m) => m.status === "PENDING").every((m) => m.boardNumber === 0)).toBe(true);
    expect(round3.filter((m) => m.status === "IN_PROGRESS").every((m) => m.boardNumber > 0)).toBe(true);

    const stalePendingAnywhere = await prisma.match.count({
      where: { tournamentId: t.id, status: "PENDING", boardNumber: { gt: 0 } },
    });
    expect(stalePendingAnywhere).toBe(0);
  });
});

describe("dbArbitrateMatch — arbitrage rapide déjà propagé (DO-SPORT-002, problème 2)", () => {
  async function makeQuickMatch(nbBoards = 2) {
    const t = await makeTournament({ nb_boards: nbBoards, players_per_team: 1 });
    await prisma.tournament.update({ where: { id: t.id }, data: { quickMode: true } });
    const p1 = await makePlayer(t.id, "Winner", 2);
    const p2 = await makePlayer(t.id, "Loser", 2);
    const roundId = await makeQuickRounds(t.id);
    const match = await makeMatch(t.id, roundId, p1.id, p2.id, {
      boardNumber: 1, status: "IN_PROGRESS", bracketRound: 1, bracketPosition: 0, bracketType: "WINNERS",
    });
    return { t, p1, p2, match, setId: match.sets[0].id };
  }

  it("1 — avant propagation (quickAdvanceProcessedAt = null) : l'arbitrage reste autorisé selon les règles existantes", async () => {
    const { t, p1, match, setId } = await makeQuickMatch();

    const result = await dbArbitrateMatch(match.id, t.id, [{ setId, winnerId: p1.id }]);
    expect(result.error).toBeUndefined();
    expect(result.matchFinished).toBe(true);

    const finalMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(finalMatch.status).toBe("FINISHED");
    expect(finalMatch.winnerId).toBe(p1.id);
  });

  it("2/3/4/5/6/7 — après propagation : refus explicite, aucune donnée modifiée, comportement identique en appel répété", async () => {
    const { t, p1, p2, match, setId } = await makeQuickMatch();

    // Simule l'état laissé par doAdvanceQuickTournament une fois ce résultat propagé : match
    // FINISHED, vie du perdant déjà décrémentée, marqueur d'idempotence posé.
    await prisma.match.update({
      where: { id: match.id },
      data: { status: "FINISHED", winnerId: p1.id, quickAdvanceProcessedAt: new Date() },
    });
    await prisma.registration.update({ where: { id: p2.id }, data: { lives: 1 } });

    const matchBefore = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const loserBefore = await prisma.registration.findUniqueOrThrow({ where: { id: p2.id } });
    const setBefore = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchCountBefore = await prisma.match.count({ where: { tournamentId: t.id } });

    // Tentative de correction organisateur : changer le vainqueur vers le perdant d'origine.
    const attempt1 = await dbArbitrateMatch(match.id, t.id, [{ setId, winnerId: p2.id }]);
    expect(attempt1.error).toBeDefined(); // 2 — refus explicite
    expect(attempt1.error).toMatch(/déjà été propagé/i); // 5 — message explicite (voir UX attendue)
    expect(attempt1.matchFinished).toBeUndefined();

    // 7 — rejeu de la même commande : comportement identique, jamais une issue différente.
    const attempt2 = await dbArbitrateMatch(match.id, t.id, [{ setId, winnerId: p2.id }]);
    expect(attempt2.error).toBe(attempt1.error);

    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const loserAfter = await prisma.registration.findUniqueOrThrow({ where: { id: p2.id } });
    const setAfter = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchCountAfter = await prisma.match.count({ where: { tournamentId: t.id } });

    expect(matchAfter.winnerId).toBe(matchBefore.winnerId); // 3 — aucune modification du vainqueur
    expect(matchAfter.status).toBe(matchBefore.status);
    expect(matchAfter.updatedAt.getTime()).toBe(matchBefore.updatedAt.getTime()); // 6 — match non modifié
    expect(setAfter.winnerId).toBe(setBefore.winnerId); // aucune modification du set d'origine
    expect(loserAfter.lives).toBe(loserBefore.lives); // 4 — aucune modification des vies
    expect(matchCountAfter).toBe(matchCountBefore); // aucun nouveau match créé
  });
});
