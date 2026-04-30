import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ScoreForm } from "@/components/tournament/ScoreForm";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ board?: string }>;
}

export const metadata: Metadata = { title: "Saisie du score — DartsOpen" };

export default async function ScorePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { board } = await searchParams;
  const boardNumber = parseInt(board ?? "1", 10);

  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (!tournament || tournament.status !== "IN_PROGRESS") notFound();

  // Récupère le match en cours sur cette cible
  const { data: match } = await supabase
    .from("matches")
    .select(`
      id, board_number, status,
      player1:registrations!matches_player1_id_fkey(id, player_name),
      player2:registrations!matches_player2_id_fkey(id, player_name),
      match_sets(
        id, round_order, winner_id, validated_p1, validated_p2,
        winner:registrations(player_name)
      )
    `)
    .eq("tournament_id", id)
    .eq("board_number", boardNumber)
    .eq("status", "IN_PROGRESS")
    .single();

  // Récupère la config des rounds
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, order, game_type, entry_type, finish_type")
    .eq("tournament_id", id)
    .order("order");

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header cible */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-4">
        <p className="text-gray-400 text-xs uppercase tracking-wider">🎯 {tournament.name}</p>
        <h1 className="text-xl font-bold mt-1">Cible {boardNumber}</h1>
      </div>

      <div className="flex-1 px-4 py-6">
        {!match ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">⏳</p>
            <p className="text-gray-400">Aucun match en cours sur cette cible.</p>
            <p className="text-gray-500 text-sm mt-2">Le prochain match sera annoncé ici.</p>
          </div>
        ) : (
          <ScoreForm
            match={match as Parameters<typeof ScoreForm>[0]["match"]}
            rounds={rounds ?? []}
          />
        )}
      </div>
    </div>
  );
}
