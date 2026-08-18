import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import {
  dbCreateTournament,
  dbRecordThrow,
  dbCancelLastThrow,
  dbListMatchSetThrows,
  dbDeleteTournament,
  bulkCreateMatchesTx,
  withTournamentLock,
} from "@/lib/db/tournament";
import { computeRemaining, computeActivePlayer } from "@/lib/utils/x01";

/**
 * DO-SCORING-001 — preuves réelles, contre un vrai PostgreSQL (jamais mocké), que la saisie
 * X01 traditionnelle est désormais persistée, reprenable et idempotente : PostgreSQL est la
 * source de vérité, plus l'état React du navigateur. Même discipline que les fichiers
 * *.concurrency.test.ts précédents (DO-SPORT-001/002) : Promise.all pour la concurrence réelle,
 * vérification de l'état final en base, jamais seulement la valeur de retour.
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    // Ordre imposé par les FK par défaut (RESTRICT) : match_set_throws référence match_sets
    // (CASCADE, donc pas strictement nécessaire de le faire avant) ET registrations (RESTRICT) —
    // toujours purger les volées avant les inscriptions.
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
    "user-x01-scoring",
    {
      name: "Tournoi X01",
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
  gameType = "501",
  finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER" = "DOUBLE",
) {
  const r = await prisma.round.create({
    data: { tournamentId, roundOrder: order, gameType, entryType: "SINGLE", finishType },
    select: { id: true },
  });
  return r.id;
}

/** Crée un match standard (bracket) avec une MatchSet par round fourni, dans l'ordre. */
async function makeMatchWithSets(
  tournamentId: string,
  p1Id: string,
  p2Id: string,
  roundIds: string[],
  opts: { boardNumber: number; status: "PENDING" | "IN_PROGRESS" } = { boardNumber: 1, status: "IN_PROGRESS" },
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

describe("dbRecordThrow — persistance, alternance, bust (DO-SCORING-001, points 1/2/3/4)", () => {
  it("première volée persistée, plusieurs volées successives, alternance correcte, bust cède quand même le tour", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    // 1 — première volée persistée.
    const r1 = await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    if ("error" in r1) throw new Error(r1.error);
    expect(r1.bust).toBe(false);

    let throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);
    expect(throws[0].player_id).toBe(p1.id);
    expect(throws[0].remaining_after).toBe(441);
    expect(throws[0].sequence).toBe(1);

    // 3 — alternance : le tour attendu est maintenant p2 ; soumettre p1 doit être refusé.
    const wrongTurn = await dbRecordThrow(setId, t.id, 1, 20, randomUUID());
    expect("error" in wrongTurn && wrongTurn.error).toMatch(/tour/i);

    // 2 — volées successives.
    const r2 = await dbRecordThrow(setId, t.id, 2, 45, randomUUID());
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.bust).toBe(false);

    // 4 — bust : 163 est une valeur impossible à réaliser en une volée (règle existante,
    // lib/utils/x01.ts::IMPOSSIBLE_VOLEE) → bust quel que soit le restant, et cède quand même
    // le tour à p2.
    const r3 = await dbRecordThrow(setId, t.id, 1, 163, randomUUID());
    if ("error" in r3) throw new Error(r3.error);
    expect(r3.bust).toBe(true);

    throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(3);
    expect(throws.map((x) => x.sequence)).toEqual([1, 2, 3]);
    expect(throws[2].bust).toBe(true);
    expect(throws[2].remaining_after).toBe(441); // inchangé par le bust

    expect(computeRemaining(throws, p1.id, 501)).toBe(441); // le bust n'a pas changé le restant de p1
    expect(computeRemaining(throws, p2.id, 501)).toBe(456);
    expect(computeActivePlayer(throws, p1.id, p2.id)).toBe(p2.id); // le tour est bien passé à p2 malgré le bust
  });
});

describe("dbRecordThrow — checkout, victoire, changement de manche (DO-SCORING-001, point 5/6)", () => {
  it("checkout ferme la manche sans finaliser un match à plusieurs manches ; la manche suivante reste indépendante", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const round1 = await makeRound(t.id, 1, "40", "DOUBLE"); // checkout rapide et sûr (40 ne laisse jamais 1)
    const round2 = await makeRound(t.id, 2, "501", "DOUBLE");
    const { match, sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [round1, round2]);
    const [set1, set2] = sets;

    const checkout = await dbRecordThrow(set1.id, t.id, 1, 40, randomUUID());
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.bust).toBe(false);
    expect(checkout.matchSetFinished).toBe(true);
    expect(checkout.matchFinished).toBe(false); // il reste une manche à jouer

    const set1Final = await prisma.matchSet.findUniqueOrThrow({ where: { id: set1.id } });
    expect(set1Final.winnerId).toBe(p1.id);
    expect(set1Final.validatedP1).toBe(true);
    expect(set1Final.validatedP2).toBe(true);

    // La deuxième manche reste totalement indépendante — aucune volée, aucun vainqueur.
    const set2Final = await prisma.matchSet.findUniqueOrThrow({ where: { id: set2.id } });
    expect(set2Final.winnerId).toBeNull();
    expect(await dbListMatchSetThrows(set2.id)).toHaveLength(0);

    const matchFinal = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchFinal.status).toBe("IN_PROGRESS"); // le match lui-même n'est pas terminé

    // La manche 2 fonctionne indépendamment, avec son propre restant/alternance.
    const r = await dbRecordThrow(set2.id, t.id, 1, 100, randomUUID());
    if ("error" in r) throw new Error(r.error);
    expect(r.matchSetFinished).toBe(false);
    const throws2 = await dbListMatchSetThrows(set2.id);
    expect(throws2).toHaveLength(1);
    expect(throws2[0].remaining_after).toBe(401);
  });
});

describe("Reprise après refresh / changement d'appareil (DO-SCORING-001, points 7/8)", () => {
  it("plusieurs volées puis relecture serveur indépendante (refresh, ou nouvel appareil) reconstruisent exactement le même état", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    await dbRecordThrow(setId, t.id, 2, 45, randomUUID());
    await dbRecordThrow(setId, t.id, 1, 20, randomUUID());

    // "Refresh" : une lecture serveur indépendante, comme le ferait app/(public)/t/[id]/score.
    const afterRefresh = await dbListMatchSetThrows(setId);
    expect(afterRefresh).toHaveLength(3);
    expect(computeRemaining(afterRefresh, p1.id, 501)).toBe(421); // 501-60-20
    expect(computeRemaining(afterRefresh, p2.id, 501)).toBe(456); // 501-45
    expect(computeActivePlayer(afterRefresh, p1.id, p2.id)).toBe(p2.id);

    // "Changement d'appareil" : à nouveau une lecture serveur fraîche et indépendante — état
    // identique, jamais dépendant d'un state React conservé sur le premier appareil.
    const fromOtherDevice = await dbListMatchSetThrows(setId);
    expect(fromOtherDevice).toEqual(afterRefresh);
  });

  it("volée confirmée serveur → réponse client perdue → refresh : la volée est présente exactement une fois", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;
    const clientRequestId = randomUUID();

    const first = await dbRecordThrow(setId, t.id, 1, 60, clientRequestId);
    if ("error" in first) throw new Error(first.error);

    // Le client n'a jamais vu la réponse (timeout perçu) : il retente la MÊME commande.
    const retry = await dbRecordThrow(setId, t.id, 1, 60, clientRequestId);
    if ("error" in retry) throw new Error(retry.error);
    expect(retry.throwId).toBe(first.throwId);

    const afterRefresh = await dbListMatchSetThrows(setId);
    expect(afterRefresh).toHaveLength(1); // exactement une fois, jamais deux
  });
});

describe("Idempotence et concurrence des volées (DO-SCORING-001, points 9/10/11/12/20)", () => {
  it("9/10 — double-clic concurrent et retry séquentiel de la même commande : une seule volée persistée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;
    const clientRequestId = randomUUID();

    // Double-clic : deux appels concurrents avec EXACTEMENT la même commande.
    const [a, b] = await Promise.all([
      dbRecordThrow(setId, t.id, 1, 60, clientRequestId),
      dbRecordThrow(setId, t.id, 1, 60, clientRequestId),
    ]);
    if ("error" in a) throw new Error(a.error);
    if ("error" in b) throw new Error(b.error);
    expect(a.throwId).toBe(b.throwId);

    // Retry séquentiel après coup (réponse perdue perçue par le client) : toujours la même volée.
    const retry = await dbRecordThrow(setId, t.id, 1, 60, clientRequestId);
    if ("error" in retry) throw new Error(retry.error);
    expect(retry.throwId).toBe(a.throwId);

    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);
  });

  it("11/12/20 — deux commandes concurrentes distinctes partant du même état : une seule gagne, ordre garanti, état final cohérent", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    // Deux commandes DIFFÉRENTES, toutes deux pour le joueur 1 (partant du même état initial —
    // aucune volée encore enregistrée, p1 est censé commencer).
    const [x, y] = await Promise.all([
      dbRecordThrow(setId, t.id, 1, 60, randomUUID()),
      dbRecordThrow(setId, t.id, 1, 45, randomUUID()),
    ]);
    const results = [x, y];
    const succeeded = results.filter((r) => !("error" in r));
    const refused = results.filter((r) => "error" in r);

    // 11 — jamais deux évolutions incompatibles : une seule volée a pu être acceptée comme celle
    // de p1, l'autre est rejetée car ce n'est plus son tour une fois la première appliquée.
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as { error: string }).error).toMatch(/tour/i);

    // 12/20 — ordre garanti, état final cohérent : une seule ligne, séquence 1.
    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(1);
    expect(throws[0].sequence).toBe(1);
    expect(throws[0].player_id).toBe(p1.id);
  });
});

describe("dbCancelLastThrow — annulation contrôlée (DO-SCORING-001, points 13/14/15/16)", () => {
  it("13 — annule la dernière volée et restaure exactement l'état précédent (bon joueur actif, bon restant)", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    await dbRecordThrow(setId, t.id, 2, 45, randomUUID());

    const cancel = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(cancel.error).toBeUndefined();

    const throws = await dbListMatchSetThrows(setId);
    expect(throws).toHaveLength(2); // jamais supprimée, seulement marquée annulée
    expect(throws[1].cancelled).toBe(true);
    expect(computeRemaining(throws, p2.id, 501)).toBe(501); // restauré exactement
    expect(computeActivePlayer(throws, p1.id, p2.id)).toBe(p2.id); // c'est de nouveau à p2 de jouer
  });

  it("14 — annulation après un bust restaure le tour au joueur qui avait busté", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    await dbRecordThrow(setId, t.id, 1, 60, randomUUID()); // p1 : 441
    const bust = await dbRecordThrow(setId, t.id, 2, 166, randomUUID()); // p2 buste (valeur impossible)
    if ("error" in bust) throw new Error(bust.error);
    expect(bust.bust).toBe(true);

    let throws = await dbListMatchSetThrows(setId);
    expect(computeActivePlayer(throws, p1.id, p2.id)).toBe(p1.id); // le tour est passé à p1

    const cancel = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(cancel.error).toBeUndefined();

    throws = await dbListMatchSetThrows(setId);
    expect(computeActivePlayer(throws, p1.id, p2.id)).toBe(p2.id); // restauré : c'est à nouveau à p2
    expect(computeRemaining(throws, p2.id, 501)).toBe(501); // le bust n'avait de toute façon rien changé
  });

  it("15 — double annulation/retry de la même commande est idempotente ; une nouvelle commande cible la nouvelle dernière volée", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    await dbRecordThrow(setId, t.id, 2, 45, randomUUID());

    const cancelRequestId = randomUUID();
    const first = await dbCancelLastThrow(setId, t.id, cancelRequestId);
    expect(first.error).toBeUndefined();

    // Retry exact de la même commande d'annulation.
    const retry = await dbCancelLastThrow(setId, t.id, cancelRequestId);
    expect(retry.error).toBeUndefined();
    expect(retry.cancelledThrowId).toBe(first.cancelledThrowId);

    const throwsAfterRetry = await dbListMatchSetThrows(setId);
    expect(throwsAfterRetry.filter((x) => x.cancelled)).toHaveLength(1); // jamais une deuxième annulation

    // Une NOUVELLE commande d'annulation (id différent) cible bien la nouvelle dernière volée.
    const second = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(second.error).toBeUndefined();
    expect(second.cancelledThrowId).not.toBe(first.cancelledThrowId);

    const throwsFinal = await dbListMatchSetThrows(setId);
    expect(throwsFinal.every((x) => x.cancelled)).toBe(true);
  });

  it("16 — le rejeu d'une commande d'annulation ne cible jamais une volée devenue entre-temps la nouvelle dernière", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    const secondThrow = await dbRecordThrow(setId, t.id, 2, 45, randomUUID());
    if ("error" in secondThrow) throw new Error(secondThrow.error);

    const cancelRequestId = randomUUID();
    const cancelResult = await dbCancelLastThrow(setId, t.id, cancelRequestId);
    expect(cancelResult.cancelledThrowId).toBe(secondThrow.throwId);

    // Une NOUVELLE volée est enregistrée après l'annulation — elle devient la nouvelle dernière.
    const thirdThrow = await dbRecordThrow(setId, t.id, 2, 30, randomUUID());
    if ("error" in thirdThrow) throw new Error(thirdThrow.error);

    // Rejeu de l'ANCIENNE commande d'annulation : doit renvoyer le résultat d'origine (la
    // deuxième volée), jamais annuler la troisième (la vraie dernière aujourd'hui).
    const replay = await dbCancelLastThrow(setId, t.id, cancelRequestId);
    expect(replay.cancelledThrowId).toBe(secondThrow.throwId);

    const throws = await dbListMatchSetThrows(setId);
    const third = throws.find((x) => x.id === thirdThrow.throwId)!;
    expect(third.cancelled).toBe(false); // jamais touchée par le rejeu de l'ancienne commande
  });
});

describe("Limites de saisie et de finalisation (DO-SCORING-001, points 17/18/19)", () => {
  it("17/19 — aucune saisie acceptée après finalisation du match, jamais de double finalisation", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE"); // manche unique : le checkout finit tout le match
    const { match, sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    const checkout = await dbRecordThrow(setId, t.id, 1, 40, randomUUID());
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchFinished).toBe(true);

    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchAfter.status).toBe("FINISHED");

    // 17 — toute nouvelle tentative de saisie sur cette manche (match terminé) est refusée.
    const attempt = await dbRecordThrow(setId, t.id, 2, 10, randomUUID());
    expect("error" in attempt && attempt.error).toMatch(/déjà terminée/i);

    // 19 — rejouer la commande de checkout elle-même (retry) est un no-op idempotent, jamais une
    // seconde finalisation (le match reste FINISHED, sans erreur).
    const replay = await dbRecordThrow(setId, t.id, 1, 40, randomUUID());
    // Commande différente (nouveau clientRequestId) mais sur une manche déjà terminée : refusée
    // proprement, jamais un crash ni un second passage par tryFinalizeMatch.
    expect("error" in replay).toBe(true);

    const matchStill = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchStill.status).toBe("FINISHED");
    expect(matchStill.winnerId).toBe(p1.id);
  });

  it("18 — annulation refusée une fois la conséquence sportive du checkout propagée (match FINISHED)", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "40", "DOUBLE"); // manche unique : checkout = fin de match
    const { match, sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    const setId = sets[0].id;

    const checkout = await dbRecordThrow(setId, t.id, 1, 40, randomUUID());
    if ("error" in checkout) throw new Error(checkout.error);
    expect(checkout.matchFinished).toBe(true);

    const setBefore = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchBefore = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const throwBefore = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });

    const cancel = await dbCancelLastThrow(setId, t.id, randomUUID());
    expect(cancel.error).toBeDefined();
    expect(cancel.error).toMatch(/propagée/i);

    // Aucune donnée modifiée par la tentative refusée.
    const setAfter = await prisma.matchSet.findUniqueOrThrow({ where: { id: setId } });
    const matchAfter = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    const throwAfter = await prisma.matchSetThrow.findUniqueOrThrow({ where: { id: checkout.throwId } });
    expect(setAfter).toEqual(setBefore);
    expect(matchAfter.status).toBe(matchBefore.status);
    expect(matchAfter.winnerId).toBe(matchBefore.winnerId);
    expect(throwAfter.cancelledAt).toBeNull();
    expect(throwAfter).toEqual(throwBefore);
  });
});

describe("Compatibilité avec les données existantes (DO-SCORING-001, Étape 11)", () => {
  it("un tournoi sans aucune volée persistée (ancien match) se lit normalement : historique vide, jamais d'erreur ni d'historique fabriqué", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);

    // Simule un match déjà en cours AVANT cette mission (vainqueur de manche déjà connu par un
    // autre mécanisme, mais aucune ligne de volée n'a jamais existé pour lui).
    const throws = await dbListMatchSetThrows(sets[0].id);
    expect(throws).toEqual([]); // jamais une erreur, jamais un historique inventé
    expect(computeRemaining(throws, p1.id, 501)).toBe(501); // état de départ, honnêtement affiché
    expect(computeActivePlayer(throws, p1.id, p2.id)).toBe(p1.id);
  });

  it("un tournoi dont une manche a un historique de volées reste supprimable dans son ensemble (cascade cohérente)", async () => {
    const t = await makeTournament({ nb_boards: 2 });
    const p1 = await makePlayer(t.id, "Alice");
    const p2 = await makePlayer(t.id, "Bob");
    const roundId = await makeRound(t.id, 1, "501", "DOUBLE");
    const { sets } = await makeMatchWithSets(t.id, p1.id, p2.id, [roundId]);
    await dbRecordThrow(sets[0].id, t.id, 1, 60, randomUUID());

    await dbDeleteTournament(t.id);

    const remaining = await prisma.matchSetThrow.count({ where: { matchSetId: sets[0].id } });
    expect(remaining).toBe(0);
    const tournamentGone = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(tournamentGone).toBeNull();

    // Déjà supprimé par ce test — retire-le de la liste pour ne pas re-tenter un cleanup inutile.
    const idx = createdTournamentIds.indexOf(t.id);
    if (idx >= 0) createdTournamentIds.splice(idx, 1);
  });
});
