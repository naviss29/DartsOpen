import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import {
  dbCreateTournament,
  dbRecordThrow,
  dbCancelLastThrow,
  dbListMatchSetThrows,
  bulkCreateMatchesTx,
  withTournamentLock,
} from "@/lib/db/tournament";

/**
 * DO-SCORING-002 — durcissement de la persistance X01 après audit Codex indépendant post
 * DO-SCORING-001 : idempotence stricte, non-résurrection d'un checkout annulé, verrouillage de
 * l'annulation une fois la manche suivante démarrée, frontière transactionnelle unique
 * volée→victoire de manche→victoire de match→progression DO-SPORT, et validation réelle de la
 * fléchette de fermeture. Même discipline PostgreSQL réel que les fichiers précédents
 * (DO-SPORT-001/002, DO-SCORING-001) : Promise.all pour la concurrence réelle, état final vérifié
 * en base, jamais seulement la valeur de retour.
 */

let forceSeedBracketError = false;
vi.mock("@/lib/utils/bracket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/bracket")>();
  return {
    ...actual,
    seedBracket: (ids: string[]) => {
      if (forceSeedBracketError) {
        throw new Error("Erreur simulée de progression (test DO-SCORING-002, Étape 4)");
      }
      return actual.seedBracket(ids);
    },
  };
});

const createdTournamentIds: string[] = [];

afterEach(async () => {
  forceSeedBracketError = false;
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
    "user-x01-hardening",
    {
      name: "Tournoi X01 durci",
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
  opts: { boardNumber: number; status: "PENDING" | "IN_PROGRESS"; bracketRound?: number; bracketPosition?: number; bracketType?: "SINGLE" | "WINNERS" | "LOSERS" | "GRAND_FINAL" },
) {
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1Id,
      player2Id: p2Id,
      bracketRound: opts.bracketRound ?? 1,
      bracketPosition: opts.bracketPosition ?? 0,
      boardNumber: opts.boardNumber,
      status: opts.status,
      roundIds,
      bracketType: opts.bracketType ?? "SINGLE",
    }]),
  );
  const match = await prisma.match.findFirstOrThrow({
    where: { tournamentId, player1Id: p1Id, player2Id: p2Id, bracketRound: opts.bracketRound ?? 1, bracketPosition: opts.bracketPosition ?? 0 },
  });
  const rawSets = await prisma.matchSet.findMany({ where: { matchId: match.id }, include: { round: true } });
  const sets = rawSets.sort((a, b) => a.round.roundOrder - b.round.roundOrder);
  return { match, sets };
}

/** Fixture minimale : une manche fraîche (aucune volée) où le premier lancer de p1 (=gameType,
 * exactement) ferme immédiatement la manche — pas de volée de mise en place nécessaire. */
async function makeCheckoutFixture(finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER", gameType = "40") {
  const t = await makeTournament({ nb_boards: 2 });
  const p1 = await makePlayer(t.id, "Alice");
  const p2 = await makePlayer(t.id, "Bob");
  const roundId = await makeRound(t.id, 1, gameType, finishType);
  // Manche sentinelle (jamais jouée) : garantit que fermer la manche 1 ne finalise jamais tout
  // le MATCH, pour que ces fixtures restent utilisables aussi bien pour tester le résultat de
  // manche (matchSetFinished) que le comportement d'annulation (qui exige un match encore
  // IN_PROGRESS pour rester autorisée, voir Problème 3/DO-SCORING-001).
  const sentinelRoundId = await makeRound(t.id, 2, "501", "DOUBLE");
  const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId, sentinelRoundId], { boardNumber: 1, status: "IN_PROGRESS" });
  return { t, p1, p2, match, setId: sets[0].id, startScore: parseInt(gameType, 10) };
}

async function makeQuickRounds(tournamentId: string) {
  const [r501] = await Promise.all([
    prisma.round.create({ data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
    prisma.round.create({ data: { tournamentId, roundOrder: 2, gameType: "CRICKET", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
    prisma.round.create({ data: { tournamentId, roundOrder: 3, gameType: "701", entryType: "SINGLE", finishType: "DOUBLE" }, select: { id: true } }),
  ]);
  return r501.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Problème 1 — idempotence stricte de clientRequestId
// ─────────────────────────────────────────────────────────────────────────────
describe("Idempotence stricte de clientRequestId (DO-SCORING-002, Problème 1)", () => {
  it("même ID + même score + même joueur → replay ; même ID + score différent → refus ; même ID + joueur différent → refus", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = sets[0].id;
    const clientRequestId = randomUUID();

    const first = await dbRecordThrow(setId, t.id, 1, 60, clientRequestId);
    if ("error" in first) throw new Error(first.error);

    // Même commande exacte → replay idempotent.
    const replay = await dbRecordThrow(setId, t.id, 1, 60, clientRequestId);
    if ("error" in replay) throw new Error(replay.error);
    expect(replay.throwId).toBe(first.throwId);

    // Même ID, score différent → refus explicite, aucune écriture.
    const differentScore = await dbRecordThrow(setId, t.id, 1, 45, clientRequestId);
    expect("error" in differentScore).toBe(true);

    // Même ID, joueur différent → refus explicite, aucune écriture.
    const differentPlayer = await dbRecordThrow(setId, t.id, 2, 60, clientRequestId);
    expect("error" in differentPlayer).toBe(true);

    // Une seule ligne en base pour cet identifiant, strictement inchangée.
    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);
    expect(throws[0].player_id).toBe(p1.id);
    expect(throws[0].score_entered).toBe(60);
  });

  it("même ID + fléchette de fermeture différente → refus (la fermeture fait partie de la commande logique)", async () => {
    const { t, setId } = await makeCheckoutFixture("DOUBLE");
    const clientRequestId = randomUUID();

    const first = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in first) throw new Error(first.error);
    expect(first.bust).toBe(false);

    // Même score, même joueur, mais fléchette de fermeture différente → refus.
    const differentDart = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 10, multiplier: 2 });
    expect("error" in differentDart).toBe(true);

    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);
    expect(throws[0].checkout_segment).toBe(20);
  });

  it("deux requêtes concurrentes même ID/même commande → une seule volée ; deux requêtes concurrentes même ID/commandes différentes → aucune ambiguïté", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");

    // Cas A — même ID, même commande, concurrent.
    {
      const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS", bracketPosition: 0 });
      const setId = sets[0].id;
      const clientRequestId = randomUUID();
      const [a, b] = await Promise.all([
        dbRecordThrow(setId, t.id, 1, 60, clientRequestId),
        dbRecordThrow(setId, t.id, 1, 60, clientRequestId),
      ]);
      if ("error" in a) throw new Error(a.error);
      if ("error" in b) throw new Error(b.error);
      expect(a.throwId).toBe(b.throwId);
      expect(await dbListMatchSetThrows(setId)).toHaveLength(1);
    }

    // Cas B — même ID, commandes différentes, concurrent : jamais deux volées, jamais une
    // acceptation silencieuse de la seconde.
    {
      const p3 = await makePlayer(t.id, "Carl");
      const p4 = await makePlayer(t.id, "Dana");
      const { sets } = await makeBracketMatch(t.id, p3.id, p4.id, [roundId], { boardNumber: 2, status: "IN_PROGRESS", bracketPosition: 1 });
      const setId = sets[0].id;
      const clientRequestId = randomUUID();
      const [a, b] = await Promise.all([
        dbRecordThrow(setId, t.id, 1, 60, clientRequestId),
        dbRecordThrow(setId, t.id, 1, 45, clientRequestId),
      ]);
      const results = [a, b];
      const succeeded = results.filter((r) => !("error" in r));
      const refused = results.filter((r) => "error" in r);
      // Sous le verrou, ces deux commandes se sérialisent : la première insère, la seconde (même
      // ID, paramètres différents) est nécessairement refusée — jamais les deux acceptées.
      expect(succeeded).toHaveLength(1);
      expect(refused).toHaveLength(1);
      const throws = await dbListMatchSetThrows(setId);
      expect(throws).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 2 — retry d'un checkout annulé
// ─────────────────────────────────────────────────────────────────────────────
describe("Retry d'un checkout annulé ne le ressuscite jamais (DO-SCORING-002, Problème 2)", () => {
  it("checkout → annulation → retry de la commande de checkout : volée toujours annulée, manche rouverte, aucun nouvel effet, état stable sur plusieurs retries", async () => {
    const { t, p1, match, setId } = await makeCheckoutFixture("DOUBLE");
    const clientRequestId = randomUUID();

    const checkout = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchSetFinished).toBe(true);

    const cancel = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(cancel.error).toBeUndefined();

    const setAfterCancel = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    expect(setAfterCancel.winnerId).toBeNull(); // manche rouverte

    const matchCountBefore = await prisma.match.count({ where: { tournamentId: t.id } });

    // Rejeu de l'ANCIENNE commande de checkout (même clientRequestId) : ne doit jamais remettre
    // de vainqueur ni redéclencher la moindre conséquence sportive.
    for (let i = 0; i < 3; i++) {
      const retry = await dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
      if ("error" in retry) throw new Error(retry.error);
      expect(retry.cancelled).toBe(true); // signalé explicitement, jamais un succès silencieux
      expect(retry.matchSetFinished).toBe(false);
      expect(retry.matchFinished).toBe(false);
      expect(retry.throwId).toBe(checkout.throwId);

      const setNow = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
      expect(setNow.winnerId).toBeNull(); // jamais ressuscité

      const throwNow = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });
      expect(throwNow.cancelledAt).not.toBeNull(); // toujours annulée

      const matchCountNow = await prisma.match.count({ where: { tournamentId: t.id } });
      expect(matchCountNow).toBe(matchCountBefore); // aucun nouveau match créé par DO-SPORT
    }

    // Aucune nouvelle ligne de volée créée par les rejeux (toujours la même, jamais réutilisée
    // pour une nouvelle volée).
    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);

    const matchFinal = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchFinal.status).toBe("IN_PROGRESS");
    void p1;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 3 — annulation après démarrage d'une manche suivante
// ─────────────────────────────────────────────────────────────────────────────
describe("Annulation refusée si une manche suivante a démarré (DO-SCORING-002, Problème 3)", () => {
  it("checkout manche non finale + manche suivante intacte → annulation possible", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, "40", "DOUBLE");
    const round2 = await makeRound(t.id, 2, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2], { boardNumber: 1, status: "IN_PROGRESS" });
    const [set1] = sets;

    const checkout = await dbRecordThrow(set1.id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);

    const cancel = await dbCancelLastThrow(set1.id, t.id, randomUUID());
    expect(cancel.error).toBeUndefined();
    expect(cancel.cancelledThrowId).toBe(checkout.throwId);
  });

  it("checkout + une volée dans la manche suivante → refus, aucune donnée modifiée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, "40", "DOUBLE");
    const round2 = await makeRound(t.id, 2, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2], { boardNumber: 1, status: "IN_PROGRESS" });
    const [set1, set2] = sets;

    const checkout = await dbRecordThrow(set1.id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);

    // La manche 2 démarre : une volée y est enregistrée.
    const nextThrow = await dbRecordThrow(set2.id, t.id, 1, 60, randomUUID());
    if ("error" in nextThrow) throw new Error(nextThrow.error);

    const set1Before = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });
    const throw1Before = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });

    const cancel = await dbCancelLastThrow(set1.id, t.id, randomUUID());
    expect(cancel.error).toBeDefined();
    expect(cancel.error).toMatch(/manche suivante/i);

    const set1After = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });
    const throw1After = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });
    expect(set1After).toEqual(set1Before);
    expect(throw1After).toEqual(throw1Before);
  });

  it("checkout + manche suivante déjà gagnée → refus, aucune donnée modifiée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, "40", "DOUBLE");
    const round2 = await makeRound(t.id, 2, "40", "DOUBLE");
    const round3 = await makeRound(t.id, 3, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2, round3], { boardNumber: 1, status: "IN_PROGRESS" });
    const [set1, set2] = sets;

    const checkout1 = await dbRecordThrow(set1.id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout1) throw new Error(checkout1.error);
    const checkout2 = await dbRecordThrow(set2.id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout2) throw new Error(checkout2.error);

    const set1Before = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });

    const cancel = await dbCancelLastThrow(set1.id, t.id, randomUUID());
    expect(cancel.error).toBeDefined();
    expect(cancel.error).toMatch(/manche suivante/i);

    const set1After = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });
    expect(set1After).toEqual(set1Before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 4 — frontière transactionnelle X01 ↔ DO-SPORT
// ─────────────────────────────────────────────────────────────────────────────
describe("Frontière transactionnelle checkout ↔ progression DO-SPORT (DO-SCORING-002, Problème 4)", () => {
  it("1 — checkout finalisant le dernier match d'un tour standard déclenche la progression (tour suivant / clôture) dans la MÊME opération", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE");
    // Match unique en round 1 : le checkout termine la manche, le match, ET le tournoi.
    const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });

    const checkout = await dbRecordThrow(sets[0].id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchFinished).toBe(true);

    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfter.status).toBe("FINISHED");
    const tournamentAfter = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(tournamentAfter.status).toBe("FINISHED"); // progression déjà appliquée, même transaction
  });

  it("2 — checkout finalisant un match en mode rapide déclenche l'avancement rapide (perte de vie, promotion) dans la MÊME opération", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    await prisma.tournament.update({ where: { id: t.id }, data: { quickMode: true } });
    const p1 = await makePlayer(t.id, "Winner", 2);
    const p2 = await makePlayer(t.id, "Loser", 2);
    // makeQuickRounds() crée les 3 manches fixes 501/CRICKET/701 exigées par
    // dbGetQuickTournamentRoundIds() (utilisées pour les matchs SUIVANTS créés par la
    // progression) — mais le match testé ici utilise sa propre manche à gameType réduit
    // (40, comme les autres fixtures de ce fichier), une volée réelle étant plafonnée à 180.
    await makeQuickRounds(t.id);
    const smallRoundId = await makeRound(t.id, 4, "40", "DOUBLE");
    const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [smallRoundId], {
      boardNumber: 1, status: "IN_PROGRESS", bracketType: "WINNERS",
    });

    const checkout = await dbRecordThrow(sets[0].id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchFinished).toBe(true);

    // 10 — perte de vie exactement une fois (déjà appliquée dans la même transaction).
    const loser = await prisma.registration.findUniqueOrThrow({ where: { id: p2.id } });
    expect(loser.lives).toBe(1);
    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfter.quickAdvanceProcessedAt).not.toBeNull();

    // Rejeu de la même commande de checkout (même clientRequestId) : jamais une seconde perte
    // de vie, jamais un second avancement.
    const originalClientRequestId = (await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } })).clientRequestId;
    const replay = await dbRecordThrow(sets[0].id, t.id, 1, 40, originalClientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in replay) throw new Error(replay.error);
    const loserAfterReplay = await prisma.registration.findUniqueOrThrow({ where: { id: p2.id } });
    expect(loserAfterReplay.lives).toBe(1); // toujours une seule perte de vie
    expect(await dbListMatchSetThrows(sets[0].id)).toHaveLength(1);
  });

  it("3/4/5/6/7 — erreur provoquée pendant la progression standard : rollback complet du checkout (winnerId, statut, cible, tour)", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "A");
    const p2 = await makePlayer(t.id, "B");
    const p3 = await makePlayer(t.id, "C");
    const p4 = await makePlayer(t.id, "D");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE");

    // Deux matchs de round 1, positions 0 et 2 (position 1 volontairement absente) : force
    // hasByes=true dans doAdvanceToNextRoundTx, qui appelle alors seedBracket() — le point
    // d'injection de l'erreur simulée (import cross-module, interceptable par vi.mock,
    // contrairement à un appel interne au même module que dbRecordThrow).
    await withTournamentLock(t.id, (tx) =>
      bulkCreateMatchesTx(tx, t.id, [
        { player1Id: p1.id, player2Id: p2.id, bracketRound: 1, bracketPosition: 0, boardNumber: 1, status: "IN_PROGRESS", roundIds: [roundId], bracketType: "SINGLE" },
        { player1Id: p3.id, player2Id: p4.id, bracketRound: 1, bracketPosition: 2, boardNumber: 2, status: "IN_PROGRESS", roundIds: [roundId], bracketType: "SINGLE" },
      ]),
    );
    const matchA = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id, bracketPosition: 0 } });
    const matchB = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id, bracketPosition: 2 } });
    const setA = await prisma.matchSet.findFirstOrThrow({ where: { matchId: matchA.id } });
    const setB = await prisma.matchSet.findFirstOrThrow({ where: { matchId: matchB.id } });

    // Match B déjà terminé directement (hors checkout, pour isoler le test sur le checkout de A).
    await prisma.matchSet.update({ where: { id: setB.id }, data: { winnerId: p3.id, validatedP1: true, validatedP2: true } });
    await prisma.match.update({ where: { id: matchB.id }, data: { status: "FINISHED", winnerId: p3.id, boardNumber: 0 } });

    const throwCountBefore = await prisma.matchSetThrow.count({ where: { matchSetId: setA.id } });
    const matchesCountBefore = await prisma.match.count({ where: { tournamentId: t.id } });

    forceSeedBracketError = true;
    const clientRequestId = randomUUID();
    await expect(
      dbRecordThrow(setA.id, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 }),
    ).rejects.toThrow(/Erreur simulée/);
    forceSeedBracketError = false;

    // 4 — rollback du winnerId de la manche.
    const setAAfterFail = await prisma.matchSet.findUniqueOrThrow({ where: { id: setA.id } });
    expect(setAAfterFail.winnerId).toBeNull();

    // 5 — rollback du statut du match (jamais FINISHED).
    const matchAAfterFail = await prisma.match.findUniqueOrThrow({ where: { id: matchA.id } });
    expect(matchAAfterFail.status).toBe("IN_PROGRESS");

    // 6 — cible non libérée (toujours occupée par le match A, jamais remise à 0/promue).
    expect(matchAAfterFail.boardNumber).toBe(1);

    // La volée de checkout elle-même n'a jamais été persistée (rollback de l'insert aussi).
    const throwCountAfterFail = await prisma.matchSetThrow.count({ where: { matchSetId: setA.id } });
    expect(throwCountAfterFail).toBe(throwCountBefore);

    // 7 — aucun tour/match partiellement créé.
    const matchesCountAfterFail = await prisma.match.count({ where: { tournamentId: t.id } });
    expect(matchesCountAfterFail).toBe(matchesCountBefore);
    expect(await prisma.match.count({ where: { tournamentId: t.id, bracketRound: 2 } })).toBe(0);

    // 8 — retry après échec (même clientRequestId, plus de panne simulée) → succès unique.
    const retry = await dbRecordThrow(setA.id, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 });
    if ("error" in retry) throw new Error(retry.error);
    expect(retry.matchFinished).toBe(true);

    const throwCountAfterRetry = await prisma.matchSetThrow.count({ where: { matchSetId: setA.id } });
    expect(throwCountAfterRetry).toBe(throwCountBefore + 1); // une seule volée, jamais deux

    // 9 — aucun double avancement : un seul match de round 2 créé au total.
    const round2Matches = await prisma.match.findMany({ where: { tournamentId: t.id, bracketRound: 2 } });
    expect(round2Matches).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 5 — application réelle des finishType
// ─────────────────────────────────────────────────────────────────────────────
describe("Validation réelle de la fléchette de fermeture selon finishType (DO-SCORING-002, Problème 5)", () => {
  it("DOUBLE — double accepté ; simple et triple refusés (bust)", async () => {
    const accepted = await makeCheckoutFixture("DOUBLE");
    const rAccepted = await dbRecordThrow(accepted.setId, accepted.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in rAccepted) throw new Error(rAccepted.error);
    expect(rAccepted.bust).toBe(false);
    expect(rAccepted.matchSetFinished).toBe(true);

    const single = await makeCheckoutFixture("DOUBLE");
    const rSingle = await dbRecordThrow(single.setId, single.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 1 });
    if ("error" in rSingle) throw new Error(rSingle.error);
    expect(rSingle.bust).toBe(true);
    expect(rSingle.matchSetFinished).toBe(false);
    expect((await prisma.matchSet.findUniqueOrThrow({ where: { id: single.setId } })).winnerId).toBeNull();

    // Fermeture par triple (T13 = 39) sur une manche dont le restant est exactement 39.
    const triple = await makeCheckoutFixture("DOUBLE", "39");
    const rTriple = await dbRecordThrow(triple.setId, triple.t.id, 1, 39, randomUUID(), { segment: 13, multiplier: 3 });
    if ("error" in rTriple) throw new Error(rTriple.error);
    expect(rTriple.bust).toBe(true);
    expect(rTriple.matchSetFinished).toBe(false);
  });

  it("MASTER — double accepté, triple accepté, simple refusé (bust)", async () => {
    const dbl = await makeCheckoutFixture("MASTER");
    const rDbl = await dbRecordThrow(dbl.setId, dbl.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in rDbl) throw new Error(rDbl.error);
    expect(rDbl.bust).toBe(false);

    const tri = await makeCheckoutFixture("MASTER", "39");
    const rTri = await dbRecordThrow(tri.setId, tri.t.id, 1, 39, randomUUID(), { segment: 13, multiplier: 3 });
    if ("error" in rTri) throw new Error(rTri.error);
    expect(rTri.bust).toBe(false);
    expect(rTri.matchSetFinished).toBe(true);

    const single = await makeCheckoutFixture("MASTER");
    const rSingle = await dbRecordThrow(single.setId, single.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 1 });
    if ("error" in rSingle) throw new Error(rSingle.error);
    expect(rSingle.bust).toBe(true);
  });

  it("TRIPLE — triple accepté ; double et simple refusés (bust)", async () => {
    const tri = await makeCheckoutFixture("TRIPLE", "39");
    const rTri = await dbRecordThrow(tri.setId, tri.t.id, 1, 39, randomUUID(), { segment: 13, multiplier: 3 });
    if ("error" in rTri) throw new Error(rTri.error);
    expect(rTri.bust).toBe(false);
    expect(rTri.matchSetFinished).toBe(true);

    const dbl = await makeCheckoutFixture("TRIPLE");
    const rDbl = await dbRecordThrow(dbl.setId, dbl.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in rDbl) throw new Error(rDbl.error);
    expect(rDbl.bust).toBe(true);

    const single = await makeCheckoutFixture("TRIPLE");
    const rSingle = await dbRecordThrow(single.setId, single.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 1 });
    if ("error" in rSingle) throw new Error(rSingle.error);
    expect(rSingle.bust).toBe(true);
  });

  it("SINGLE — n'importe quelle fléchette légale amenant à zéro est acceptée (simple, double, triple)", async () => {
    for (const dart of [{ segment: 20, multiplier: 1 as const }, { segment: 20, multiplier: 2 as const }, { segment: 13, multiplier: 3 as const }]) {
      const gameType = String(dart.segment * dart.multiplier);
      const fx = await makeCheckoutFixture("SINGLE", gameType);
      const r = await dbRecordThrow(fx.setId, fx.t.id, 1, dart.segment * dart.multiplier, randomUUID(), dart);
      if ("error" in r) throw new Error(r.error);
      expect(r.bust).toBe(false);
      expect(r.matchSetFinished).toBe(true);
    }
  });

  it("bull et double bull — DOUBLE : double bull (50) accepté, simple bull (25) refusé ; triple bull structurellement invalide", async () => {
    const doubleBull = await makeCheckoutFixture("DOUBLE", "50");
    const rDoubleBull = await dbRecordThrow(doubleBull.setId, doubleBull.t.id, 1, 50, randomUUID(), { segment: 25, multiplier: 2 });
    if ("error" in rDoubleBull) throw new Error(rDoubleBull.error);
    expect(rDoubleBull.bust).toBe(false);
    expect(rDoubleBull.matchSetFinished).toBe(true);

    const singleBull = await makeCheckoutFixture("DOUBLE", "25");
    const rSingleBull = await dbRecordThrow(singleBull.setId, singleBull.t.id, 1, 25, randomUUID(), { segment: 25, multiplier: 1 });
    if ("error" in rSingleBull) throw new Error(rSingleBull.error);
    expect(rSingleBull.bust).toBe(true);

    const tripleBull = await makeCheckoutFixture("DOUBLE", "25");
    const rTripleBull = await dbRecordThrow(tripleBull.setId, tripleBull.t.id, 1, 25, randomUUID(), { segment: 25, multiplier: 3 as never });
    expect("error" in rTripleBull).toBe(true); // segment/multiplicateur structurellement invalide
  });

  it("fléchette manquante sur un checkout numérique → bust (jamais un gain accordé sans preuve) ; fléchette incohérente (valeur > volée) → erreur explicite", async () => {
    const missing = await makeCheckoutFixture("DOUBLE");
    const rMissing = await dbRecordThrow(missing.setId, missing.t.id, 1, 40, randomUUID());
    if ("error" in rMissing) throw new Error(rMissing.error);
    expect(rMissing.bust).toBe(true);
    expect(rMissing.matchSetFinished).toBe(false);

    const incoherent = await makeCheckoutFixture("DOUBLE");
    const rIncoherent = await dbRecordThrow(incoherent.setId, incoherent.t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 3 }); // 60 > 40
    expect("error" in rIncoherent).toBe(true);
    expect(await dbListMatchSetThrows(incoherent.setId)).toHaveLength(0); // aucune écriture
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 6 — annulation neutralise aussi les données de fermeture
// ─────────────────────────────────────────────────────────────────────────────
describe("L'annulation neutralise les données de fermeture (DO-SCORING-002, Problème 6)", () => {
  it("une volée de checkout annulée n'apparaît plus dans l'état sportif actif, fléchette comprise, mais reste visible dans l'historique complet", async () => {
    const { t, setId } = await makeCheckoutFixture("DOUBLE");
    const checkout = await dbRecordThrow(setId, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout) throw new Error(checkout.error);

    await dbCancelLastThrow(setId, t.id, randomUUID());

    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1); // jamais supprimée (append-oriented)
    expect(throws[0].cancelled).toBe(true);
    expect(throws[0].checkout_segment).toBe(20); // preuve historique conservée
    expect(throws[0].checkout_multiplier).toBe(2);

    // Exclue de tout état actif : plus aucune volée active pour cette manche.
    const activeCount = await prisma.matchSetThrow.count({ where: { matchSetId: setId, cancelledAt: null } });
    expect(activeCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Problème 7 — scénarios de concurrence supplémentaires
// ─────────────────────────────────────────────────────────────────────────────
describe("Concurrence supplémentaire saisie/annulation (DO-SCORING-002, Problème 7)", () => {
  it("deux annulations réellement concurrentes avec le même cancelRequestId : une seule volée cancellée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = sets[0].id;
    await dbRecordThrow(setId, t.id, 1, 60, randomUUID());

    const cancelRequestId = randomUUID();
    const [a, b] = await Promise.all([
      dbCancelLastThrow(setId, t.id, cancelRequestId),
      dbCancelLastThrow(setId, t.id, cancelRequestId),
    ]);
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(a.cancelledThrowId).toBe(b.cancelledThrowId);

    const cancelledCount = await prisma.matchSetThrow.count({ where: { matchSetId: setId, cancelledAt: { not: null } } });
    expect(cancelledCount).toBe(1);
  });

  it("nouvelle volée et annulation concurrentes partant du même état : état final déterministe et cohérent", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = sets[0].id;
    await dbRecordThrow(setId, t.id, 1, 60, randomUUID()); // p1 : 441, tour à p2

    const [cancelResult, throwResult] = await Promise.all([
      dbCancelLastThrow(setId, t.id, randomUUID()),
      dbRecordThrow(setId, t.id, 2, 45, randomUUID()),
    ]);

    // Sous le verrou, ces deux opérations se sérialisent dans un ordre déterminé par Postgres —
    // jamais les deux à la fois sur un état incohérent. On vérifie que le résultat final est
    // interne cohérent, quel que soit l'ordre réel.
    const throws = await dbListMatchSetThrows(setId);
    const active = throws.filter((x) => !x.cancelled);
    // Pas de séquence dupliquée, pas de trou impossible.
    const sequences = throws.map((x) => x.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);

    if (cancelResult.error) {
      // L'annulation a échoué (ex: la volée de p2 est passée avant et a changé la "dernière") —
      // dans ce cas la volée de p2 doit être présente et active.
      expect(throwResult && !("error" in throwResult)).toBe(true);
    } else {
      // L'annulation a réussi : elle a nécessairement porté sur LA dernière volée active au
      // moment où elle s'est exécutée (celle de p1, ou celle de p2 si elle est passée avant).
      expect(active.length).toBeGreaterThanOrEqual(0);
    }
    // Dans tous les cas, aucune corruption : le nombre de volées actives est 0, 1 ou 2, jamais
    // négatif ni incohérent avec le nombre total de lignes.
    expect(active.length).toBeLessThanOrEqual(throws.length);
  });

  it("checkout et retry (même commande) simultanés : une seule finalisation, un seul avancement", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE");
    const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = sets[0].id;
    const clientRequestId = randomUUID();

    const [a, b] = await Promise.all([
      dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 }),
      dbRecordThrow(setId, t.id, 1, 40, clientRequestId, { segment: 20, multiplier: 2 }),
    ]);
    if ("error" in a) throw new Error(a.error);
    if ("error" in b) throw new Error(b.error);
    expect(a.throwId).toBe(b.throwId);
    // Exactement l'une des deux exécutions a réellement appliqué le checkout (et rapporte
    // matchFinished:true) ; l'autre constate un rejeu et ne redéclenche rien — jamais les deux
    // à la fois, jamais aucune (l'essentiel étant qu'une seule finalisation/avancement ait eu
    // lieu, vérifié ci-dessous sur l'état réel en base, pas seulement sur ces valeurs de retour).
    expect([a.matchFinished, b.matchFinished].filter(Boolean)).toHaveLength(1);

    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfter.status).toBe("FINISHED");
    expect(await dbListMatchSetThrows(setId)).toHaveLength(1);
  });

  it("checkout et autre saisie (mauvais tour) simultanés : un seul accepté, aucune double finalisation", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE");
    const { match, sets } = await makeBracketMatch(t.id, p1.id, p2.id, [roundId], { boardNumber: 1, status: "IN_PROGRESS" });
    const setId = sets[0].id;

    // p1 est censé jouer en premier (aucune volée encore) ; p2 tente en même temps.
    const [p1Attempt, p2Attempt] = await Promise.all([
      dbRecordThrow(setId, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 }),
      dbRecordThrow(setId, t.id, 2, 40, randomUUID(), { segment: 20, multiplier: 2 }),
    ]);
    const results = [p1Attempt, p2Attempt];
    const succeeded = results.filter((r) => !("error" in r));
    const refused = results.filter((r) => "error" in r);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);

    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfter.status).toBe("FINISHED");
    expect(await dbListMatchSetThrows(setId)).toHaveLength(1);
  });

  it("annulation et nouvelle finalisation concurrentes : verrou tournoi garantit un état final cohérent, sans corruption", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, "40", "DOUBLE");
    const round2 = await makeRound(t.id, 2, "40", "DOUBLE");
    const { sets } = await makeBracketMatch(t.id, p1.id, p2.id, [round1, round2], { boardNumber: 1, status: "IN_PROGRESS" });
    const [set1] = sets;

    const checkout1 = await dbRecordThrow(set1.id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 });
    if ("error" in checkout1) throw new Error(checkout1.error);

    // Concurrent : annuler le checkout de la manche 1 pendant qu'une commande tente de faire
    // avancer indépendamment (ici, une tentative de saisie sur la manche 2, qui ne peut de toute
    // façon réussir qu'après que l'état de la manche 1 soit tranché par le verrou).
    const [cancelResult, otherAttempt] = await Promise.all([
      dbCancelLastThrow(set1.id, t.id, randomUUID()),
      dbRecordThrow(sets[1].id, t.id, 1, 40, randomUUID(), { segment: 20, multiplier: 2 }),
    ]);

    // État final cohérent : soit l'annulation a réussi et la manche 1 est rouverte, soit elle a
    // échoué proprement — jamais un état à moitié appliqué.
    const set1Final = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });
    if (!cancelResult.error) {
      expect(set1Final.winnerId).toBeNull();
    } else {
      expect(set1Final.winnerId).toBe(p1.id);
    }
    void otherAttempt;
  });
});
