"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { seedBracket } from "@/lib/utils/bracket";
import { computePoolStandings } from "@/lib/utils/pools";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function generateBracket(tournamentId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, nb_boards, nb_pools, advancement_per_pool, association_id")
    .eq("id", tournamentId)
    .eq("association_id", user.id)
    .single();

  if (!tournament) return { error: "Tournoi introuvable." };

  let advancingPlayers: string[] = [];

  if (tournament.nb_pools === 1) {
    // Élimination directe : tous les joueurs inscrits (PAID) passent au bracket
    const { data: registrations } = await supabase
      .from("registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("status", "PAID")
      .order("created_at");

    advancingPlayers = (registrations ?? []).map((r) => r.id);
  } else {
    // Multi-poules : vérifier que tous les matchs de poules sont terminés
    const { count: pendingCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .not("pool_id", "is", null)
      .neq("status", "FINISHED");

    if (pendingCount && pendingCount > 0) {
      return { error: "Tous les matchs de poules doivent être terminés avant de générer les phases finales." };
    }

    // Récupérer les poules avec joueurs
    const { data: pools } = await supabase
      .from("pools")
      .select(`id, name, pool_players(registration_id, registrations(player_name))`)
      .eq("tournament_id", tournamentId)
      .order("name");

    // Récupérer les matchs de poules terminés avec leurs sets
    const { data: poolMatches } = await supabase
      .from("matches")
      .select("player1_id, player2_id, winner_id, pool_id, match_sets(winner_id)")
      .eq("tournament_id", tournamentId)
      .eq("status", "FINISHED")
      .not("pool_id", "is", null);

    if (!pools?.length || poolMatches === null) return { error: "Données de poules introuvables." };

    for (let rank = 0; rank < tournament.advancement_per_pool; rank++) {
      for (const pool of pools) {
        const poolMatchResults = poolMatches.filter((m) => m.pool_id === pool.id);

        const players = pool.pool_players.map((pp) => ({
          registration_id: pp.registration_id,
          player_name: (Array.isArray(pp.registrations) ? pp.registrations[0] : pp.registrations as { player_name: string })?.player_name ?? "",
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

          for (const s of m.match_sets) {
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

  // Supprimer les matchs de bracket existants
  await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .is("pool_id", null);

  const pairs = seedBracket(advancingPlayers);
  const { data: rounds } = await supabase
    .from("rounds")
    .select("order")
    .eq("tournament_id", tournamentId)
    .order("order");

  let boardCounter = 1;

  for (const pair of pairs) {
    if (pair.player1_id === null) continue;

    if (pair.player2_id === null) {
      // BYE — victoire automatique
      await supabase.from("matches").insert({
        tournament_id: tournamentId,
        bracket_round: 1,
        bracket_position: pair.bracket_position,
        board_number: 0,
        player1_id: pair.player1_id,
        player2_id: pair.player1_id,
        winner_id: pair.player1_id,
        status: "FINISHED",
      });
    } else {
      const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
      const isFirst = boardCounter <= tournament.nb_boards;
      boardCounter++;

      const { data: match } = await supabase
        .from("matches")
        .insert({
          tournament_id: tournamentId,
          bracket_round: 1,
          bracket_position: pair.bracket_position,
          board_number: boardNum,
          player1_id: pair.player1_id,
          player2_id: pair.player2_id,
          status: isFirst ? "IN_PROGRESS" : "PENDING",
        })
        .select("id")
        .single();

      if (match && rounds?.length) {
        await supabase.from("match_sets").insert(
          rounds.map((r) => ({ match_id: match.id, round_order: r.order }))
        );
      }
    }
  }

  return {};
}

export async function advanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, nb_boards, association_id")
    .eq("id", tournamentId)
    .eq("association_id", user.id)
    .single();

  if (!tournament) return { error: "Tournoi introuvable." };

  const { data: currentMatches } = await supabase
    .from("matches")
    .select("id, bracket_position, winner_id, status, player1_id, player2_id")
    .eq("tournament_id", tournamentId)
    .eq("bracket_round", currentBracketRound)
    .order("bracket_position");

  if (!currentMatches?.length) return { error: "Aucun match trouvé pour ce tour." };

  const allFinished = currentMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return { error: "Tous les matchs du tour en cours doivent être terminés." };

  // Finale jouée — tournoi terminé
  if (currentMatches.length === 1) return { finished: true };

  const { data: rounds } = await supabase
    .from("rounds")
    .select("order")
    .eq("tournament_id", tournamentId)
    .order("order");

  const nextRound = currentBracketRound + 1;
  let boardCounter = 1;

  for (let i = 0; i < currentMatches.length; i += 2) {
    const m1 = currentMatches[i];
    const m2 = currentMatches[i + 1];
    if (!m1 || !m2) break;

    const p1 = m1.winner_id;
    const p2 = m2.winner_id;
    if (!p1 || !p2) return { error: "Certains matchs n'ont pas de gagnant." };

    const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
    const isFirst = boardCounter <= tournament.nb_boards;
    boardCounter++;

    const { data: newMatch } = await supabase
      .from("matches")
      .insert({
        tournament_id: tournamentId,
        bracket_round: nextRound,
        bracket_position: Math.floor(i / 2),
        board_number: boardNum,
        player1_id: p1,
        player2_id: p2,
        status: isFirst ? "IN_PROGRESS" : "PENDING",
      })
      .select("id")
      .single();

    if (newMatch && rounds?.length) {
      await supabase.from("match_sets").insert(
        rounds.map((r) => ({ match_id: newMatch.id, round_order: r.order }))
      );
    }
  }

  return {};
}
