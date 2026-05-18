"use server";

import { redirect } from "next/navigation";
import { seedBracket } from "@/lib/utils/bracket";
import { computePoolStandings } from "@/lib/utils/pools";
import { getUser } from "@/lib/api/auth";
import {
  dbGetTournament,
  dbListRegistrations,
  dbListPools,
  dbListMatches,
  dbBulkCreateMatches,
  dbDeleteBracketMatches,
} from "@/lib/db/tournament";

async function getAdvancingPlayerIds(
  tournamentId: string,
  tournament: NonNullable<Awaited<ReturnType<typeof dbGetTournament>>>
): Promise<string[]> {
  if (tournament.nb_pools === 1) {
    const registrations = await dbListRegistrations(tournamentId, "PAID");
    return registrations.map((r) => r.id);
  }

  const allMatches = await dbListMatches(tournamentId);
  const poolMatches = allMatches.filter((m) => m.pool_id !== null);
  const pools = await dbListPools(tournamentId);
  if (!pools.length) return [];

  const advancing: string[] = [];
  for (let rank = 0; rank < tournament.advancement_per_pool; rank++) {
    for (const pool of pools) {
      const poolMatchResults = poolMatches.filter((m) => m.pool_id === pool.id);

      const players = pool.players.map((p) => ({
        registration_id: p.id,
        player_name: p.player_name,
        wins: 0,
        losses: 0,
        sets_won: 0,
        sets_lost: 0,
      }));

      for (const m of poolMatchResults) {
        if (!m.winner_id) continue;
        const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
        const winner = players.find((p) => p.registration_id === m.winner_id);
        const loser = players.find((p) => p.registration_id === loserId);
        if (winner) winner.wins++;
        if (loser) loser.losses++;

        for (const s of m.sets) {
          if (!s.winner_id) continue;
          const setLoserId = s.winner_id === m.player1_id ? m.player2_id : m.player1_id;
          const setWinner = players.find((p) => p.registration_id === s.winner_id);
          const setLoser = players.find((p) => p.registration_id === setLoserId);
          if (setWinner) setWinner.sets_won++;
          if (setLoser) setLoser.sets_lost++;
        }
      }

      const standings = computePoolStandings(players);
      if (standings[rank]) advancing.push(standings[rank].registration_id);
    }
  }

  return advancing;
}

export async function generateBracket(tournamentId: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament) return { error: "Tournoi introuvable." };

  const advancingPlayers = await getAdvancingPlayerIds(tournamentId, tournament);

  if (advancingPlayers.length < 2) {
    return { error: "Pas assez de joueurs inscrits pour générer les phases finales." };
  }

  await dbDeleteBracketMatches(tournamentId);

  const pairs = seedBracket(advancingPlayers);
  const rounds = [...tournament.rounds].sort((a, b) => a.order - b.order);

  let boardCounter = 1;
  const matches: Parameters<typeof dbBulkCreateMatches>[1] = [];

  for (const pair of pairs) {
    if (pair.player1_id === null || pair.player2_id === null) {
      // Joueurs avec bye : passent directement au tour suivant, pas de match R1
      continue;
    }

    const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
    const isFirst = boardCounter <= tournament.nb_boards;
    boardCounter++;

    matches.push({
      player1Id: pair.player1_id,
      player2Id: pair.player2_id,
      bracketRound: 1,
      bracketPosition: pair.bracket_position,
      boardNumber: boardNum,
      status: isFirst ? "IN_PROGRESS" : "PENDING",
      roundIds: rounds.map((r) => r.id),
    });
  }

  const ok = await dbBulkCreateMatches(tournamentId, matches).catch(() => false);
  if (ok === false) return { error: "Erreur lors de la création des phases finales." };

  return {};
}

export async function advanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  const user = await getUser();
  if (!user) redirect("/login");

  return doAdvanceToNextRound(tournamentId, currentBracketRound);
}

export async function doAdvanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  const tournament = await dbGetTournament(tournamentId);
  if (!tournament) return { error: "Tournoi introuvable." };

  const allMatches = await dbListMatches(tournamentId);
  const bracketMatches = allMatches.filter(
    (m) => m.pool_id === null && m.bracket_round === currentBracketRound
  );

  if (!bracketMatches.length) return { error: "Aucun match trouvé pour ce tour." };

  const allFinished = bracketMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return { error: "Tous les matchs du tour en cours doivent être terminés." };

  if (bracketMatches.length === 1) return { finished: true };

  const rounds = [...tournament.rounds].sort((a, b) => a.order - b.order);
  const nextRound = currentBracketRound + 1;
  const sortedMatches = [...bracketMatches].sort(
    (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0)
  );

  const maxPosition = Math.max(...sortedMatches.map((m) => m.bracket_position ?? 0));
  const expectedSlots = maxPosition + 1;
  const hasByes = sortedMatches.length < expectedSlots;

  const nextMatches: Parameters<typeof dbBulkCreateMatches>[1] = [];
  let boardCounter = 1;

  if (hasByes) {
    // Tour 1 avec byes : recalculer le seeding pour apparier les bye-joueurs avec les vainqueurs R1
    const advancingPlayers = await getAdvancingPlayerIds(tournamentId, tournament);
    const pairs = seedBracket(advancingPlayers);
    const matchByPos = new Map(sortedMatches.map((m) => [m.bracket_position!, m]));
    const pairsByPos = new Map(pairs.map((p) => [p.bracket_position, p]));

    for (let j = 0; j < pairs.length / 2; j++) {
      const pos0 = 2 * j;
      const pos1 = 2 * j + 1;

      const m0 = matchByPos.get(pos0);
      const m1 = matchByPos.get(pos1);
      const pair0 = pairsByPos.get(pos0);
      const pair1 = pairsByPos.get(pos1);

      // Vainqueur : celui du match DB si réel, sinon le joueur bye du seeding
      const p1 = m0 ? m0.winner_id! : pair0?.player1_id;
      const p2 = m1 ? m1.winner_id! : pair1?.player1_id;

      if (!p1 || !p2) continue;

      const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
      const isFirst = boardCounter <= tournament.nb_boards;
      boardCounter++;

      nextMatches.push({
        player1Id: p1,
        player2Id: p2,
        bracketRound: nextRound,
        bracketPosition: j,
        boardNumber: boardNum,
        status: isFirst ? "IN_PROGRESS" : "PENDING",
        roundIds: rounds.map((r) => r.id),
      });
    }
  } else {
    // Tour standard sans byes : appariement séquentiel des vainqueurs
    const winners = sortedMatches.map((m) => m.winner_id!);

    for (let j = 0; j < Math.floor(winners.length / 2); j++) {
      const p1 = winners[j * 2];
      const p2 = winners[j * 2 + 1];

      const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
      const isFirst = boardCounter <= tournament.nb_boards;
      boardCounter++;

      nextMatches.push({
        player1Id: p1,
        player2Id: p2,
        bracketRound: nextRound,
        bracketPosition: j,
        boardNumber: boardNum,
        status: isFirst ? "IN_PROGRESS" : "PENDING",
        roundIds: rounds.map((r) => r.id),
      });
    }
  }

  const ok = await dbBulkCreateMatches(tournamentId, nextMatches).catch(() => false);
  if (ok === false) return { error: "Erreur lors de la création du tour suivant." };

  return {};
}
