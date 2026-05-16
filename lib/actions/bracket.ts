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
  dbAdvanceBracket,
} from "@/lib/db/tournament";

export async function generateBracket(tournamentId: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament) return { error: "Tournoi introuvable." };

  let advancingPlayers: string[] = [];

  if (tournament.nb_pools === 1) {
    const registrations = await dbListRegistrations(tournamentId, "PAID");
    advancingPlayers = registrations.map((r) => r.id);
  } else {
    const allMatches = await dbListMatches(tournamentId);
    const poolMatches = allMatches.filter((m) => m.pool_id !== null);
    const pendingCount = poolMatches.filter((m) => m.status !== "FINISHED").length;

    if (pendingCount > 0) {
      return { error: "Tous les matchs de poules doivent être terminés avant de générer les phases finales." };
    }

    const pools = await dbListPools(tournamentId);
    if (!pools.length) return { error: "Données de poules introuvables." };

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
        if (standings[rank]) {
          advancingPlayers.push(standings[rank].registration_id);
        }
      }
    }
  }

  if (advancingPlayers.length < 2) {
    return { error: "Pas assez de joueurs inscrits pour générer les phases finales." };
  }

  await dbDeleteBracketMatches(tournamentId);

  const pairs = seedBracket(advancingPlayers);
  const rounds = [...tournament.rounds].sort((a, b) => a.order - b.order);

  let boardCounter = 1;
  const matches: Parameters<typeof dbBulkCreateMatches>[1] = [];

  for (const pair of pairs) {
    if (pair.player1_id === null) continue;

    if (pair.player2_id === null) {
      matches.push({
        player1Id: pair.player1_id,
        player2Id: null,
        bracketRound: 1,
        bracketPosition: pair.bracket_position,
        boardNumber: 0,
        status: "FINISHED",
        winnerId: pair.player1_id,
        roundIds: rounds.map((r) => r.id),
      });
    } else {
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

  return dbAdvanceBracket(tournamentId, currentBracketRound);
}
