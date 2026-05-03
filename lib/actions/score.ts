"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { computeMatchWinner } from "@/lib/utils/bracket";

/**
 * Un joueur propose un gagnant pour un set.
 * playerSide: 1 = joueur 1 du match, 2 = joueur 2
 */
export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("match_sets")
    .select("*, matches(id, tournament_id, player1_id, player2_id, status)")
    .eq("id", matchSetId)
    .single();

  if (!set) return { error: "Set introuvable." };
  if (set.matches.status === "FINISHED") return { error: "Ce match est déjà terminé." };

  const update =
    playerSide === 1
      ? { winner_id: winnerId, validated_p1: true, validated_p2: false }
      : { winner_id: winnerId, validated_p2: true, validated_p1: false };

  const { error } = await supabase
    .from("match_sets")
    .update(update)
    .eq("id", matchSetId);

  if (error) return { error: "Erreur lors de la saisie du score." };

  revalidatePath(`/t/${set.matches.tournament_id}/score`);
  revalidatePath(`/t/${set.matches.tournament_id}/live`);
  return {};
}

/**
 * L'autre joueur confirme le résultat proposé.
 * Si accord → set validé. Vérifie si le match est complet.
 */
export async function confirmWinner(
  matchSetId: string,
  playerSide: 1 | 2
): Promise<{ error?: string; disputed?: boolean }> {
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("match_sets")
    .select("*, matches(id, tournament_id, player1_id, player2_id, status, board_number)")
    .eq("id", matchSetId)
    .single();

  if (!set || !set.winner_id) return { error: "Aucun résultat proposé pour ce set." };

  const confirmField = playerSide === 1 ? "validated_p1" : "validated_p2";
  await supabase
    .from("match_sets")
    .update({ [confirmField]: true })
    .eq("id", matchSetId);

  // Vérifier si tous les sets du match sont validés
  const { data: allSets } = await supabase
    .from("match_sets")
    .select("winner_id, validated_p1, validated_p2")
    .eq("match_id", set.match_id);

  const allComplete =
    allSets?.every((s) => s.validated_p1 && s.validated_p2) ?? false;

  if (allComplete && allSets) {
    const match = set.matches;
    const winnerId = computeMatchWinner(
      allSets.map((s) => ({ winner_id: s.winner_id })),
      match.player1_id,
      match.player2_id
    );

    // Finaliser le match
    await supabase
      .from("matches")
      .update({ status: "FINISHED", winner_id: winnerId })
      .eq("id", match.id);

    // Activer le prochain match PENDING sur cette cible
    const { data: nextMatch } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", match.tournament_id)
      .eq("status", "PENDING")
      .eq("board_number", match.board_number)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (nextMatch) {
      // Créer les sets pour ce match s'ils n'existent pas
      const { data: rounds } = await supabase
        .from("rounds")
        .select("order")
        .eq("tournament_id", match.tournament_id)
        .order("order");

      await supabase
        .from("matches")
        .update({ status: "IN_PROGRESS" })
        .eq("id", nextMatch.id);

      if (rounds && rounds.length > 0) {
        await supabase.from("match_sets").upsert(
          rounds.map((r) => ({ match_id: nextMatch.id, round_order: r.order })),
          { onConflict: "match_id,round_order" }
        );
      }
    }
  }

  revalidatePath(`/t/${set.matches.tournament_id}/score`);
  revalidatePath(`/t/${set.matches.tournament_id}/live`);
  return {};
}

/**
 * Mode traditionnel : valide directement le gagnant d'un set sans confirmation adverse.
 * Contrairement à proposeWinner+confirmWinner, les deux validated_p1/p2 sont mis à true
 * en une seule opération. Déclenche la même logique de fin de match (activation match suivant).
 */
export async function markWinnerDirect(
  matchSetId: string,
  winnerId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("match_sets")
    .select("*, matches(id, tournament_id, player1_id, player2_id, status, board_number)")
    .eq("id", matchSetId)
    .single();

  if (!set) return { error: "Set introuvable." };
  if (set.matches.status === "FINISHED") return { error: "Ce match est déjà terminé." };

  await supabase
    .from("match_sets")
    .update({ winner_id: winnerId, validated_p1: true, validated_p2: true })
    .eq("id", matchSetId);

  const { data: allSets } = await supabase
    .from("match_sets")
    .select("winner_id, validated_p1, validated_p2")
    .eq("match_id", set.match_id);

  const allComplete = allSets?.every((s) => s.validated_p1 && s.validated_p2) ?? false;

  if (allComplete && allSets) {
    const match = set.matches;
    const matchWinnerId = computeMatchWinner(
      allSets.map((s) => ({ winner_id: s.winner_id })),
      match.player1_id,
      match.player2_id
    );

    await supabase
      .from("matches")
      .update({ status: "FINISHED", winner_id: matchWinnerId })
      .eq("id", match.id);

    const { data: nextMatch } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", match.tournament_id)
      .eq("status", "PENDING")
      .eq("board_number", match.board_number)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (nextMatch) {
      const { data: rounds } = await supabase
        .from("rounds")
        .select("order")
        .eq("tournament_id", match.tournament_id)
        .order("order");

      await supabase
        .from("matches")
        .update({ status: "IN_PROGRESS" })
        .eq("id", nextMatch.id);

      if (rounds && rounds.length > 0) {
        await supabase.from("match_sets").upsert(
          rounds.map((r) => ({ match_id: nextMatch.id, round_order: r.order })),
          { onConflict: "match_id,round_order" }
        );
      }
    }
  }

  revalidatePath(`/t/${set.matches.tournament_id}/score`);
  revalidatePath(`/t/${set.matches.tournament_id}/live`);
  return {};
}

/**
 * Conteste le résultat proposé — remet les deux validations à false.
 */
export async function disputeResult(matchSetId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("match_sets")
    .select("match_id, matches(tournament_id)")
    .eq("id", matchSetId)
    .single();

  if (!set) return { error: "Set introuvable." };

  await supabase
    .from("match_sets")
    .update({ winner_id: null, validated_p1: false, validated_p2: false })
    .eq("id", matchSetId);

  const matchData = Array.isArray(set.matches) ? set.matches[0] : set.matches as { tournament_id: string };
  revalidatePath(`/t/${matchData.tournament_id}/score`);
  return {};
}
