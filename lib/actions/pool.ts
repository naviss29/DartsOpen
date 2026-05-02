"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { distributePlayersIntoPools } from "@/lib/utils/pools";
import { generateRoundRobin, assignBoards } from "@/lib/utils/bracket";

const POOL_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

async function getAuthenticatedTournament(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*, rounds(id, order)")
    .eq("id", tournamentId)
    .eq("association_id", user.id)
    .single();

  if (!tournament) throw new Error("Tournoi introuvable ou accès refusé.");
  return { supabase, user, tournament };
}

export async function generatePools(
  tournamentId: string,
  _prevState: { error?: string } | null,
  _formData: FormData
): Promise<{ error?: string }> {
  const { supabase, tournament } = await getAuthenticatedTournament(tournamentId);

  if (tournament.status !== "OPEN") {
    return { error: "Les poules ne peuvent être générées que lorsque le tournoi est ouvert." };
  }

  const { data: players } = await supabase
    .from("registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "PAID");

  if (!players || players.length < 2) {
    return { error: "Il faut au moins 2 équipes inscrites pour générer les poules." };
  }

  // Calcule le nombre effectif de poules réalisables (minimum 2 équipes par poule)
  const effectivePools = Math.min(tournament.nb_pools, Math.floor(players.length / 2));

  // Supprimer les poules existantes (cascade sur pool_players et matches)
  await supabase.from("pools").delete().eq("tournament_id", tournamentId);

  // Distribution serpentine dans les poules
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const poolGroups = distributePlayersIntoPools(shuffled as { id: string }[], effectivePools);

  const rounds = (tournament.rounds as Array<{ id: string; order: number }>)
    .sort((a, b) => a.order - b.order);

  let matchesToInsert: Array<{
    tournament_id: string;
    pool_id: string;
    board_number: number;
    status: "IN_PROGRESS" | "PENDING";
    player1_id: string;
    player2_id: string;
  }> = [];

  for (let i = 0; i < poolGroups.length; i++) {
    const group = poolGroups[i];
    const playerIds = group.map((p) => p.id);

    // Créer la poule
    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .insert({ tournament_id: tournamentId, name: `Poule ${POOL_NAMES[i]}` })
      .select("id")
      .single();

    if (poolError || !pool) return { error: "Erreur lors de la création des poules." };

    // Insérer les joueurs dans la poule
    await supabase.from("pool_players").insert(
      playerIds.map((pid) => ({ pool_id: pool.id, registration_id: pid }))
    );

    // Générer les matchs round-robin
    const pairings = generateRoundRobin(playerIds);
    const assigned = assignBoards(pairings, tournament.nb_boards);

    matchesToInsert = matchesToInsert.concat(
      assigned.map((m) => ({ ...m, tournament_id: tournamentId, pool_id: pool.id }))
    );
  }

  if (matchesToInsert.length === 0) return { error: "Aucun match généré." };

  // Insérer tous les matchs
  const { data: insertedMatches, error: matchError } = await supabase
    .from("matches")
    .insert(matchesToInsert)
    .select("id");

  if (matchError || !insertedMatches) return { error: "Erreur lors de la création des matchs." };

  // Créer les match_sets (un par round pour chaque match)
  if (rounds.length > 0) {
    const sets = insertedMatches.flatMap((match) =>
      rounds.map((round) => ({
        match_id: match.id,
        round_order: round.order,
      }))
    );
    await supabase.from("match_sets").insert(sets);
  }

  // Passer le tournoi EN_PROGRESS
  await supabase
    .from("tournaments")
    .update({ status: "IN_PROGRESS" })
    .eq("id", tournamentId);

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/pools`);
  redirect(`/tournaments/${tournamentId}/pools`);
}
