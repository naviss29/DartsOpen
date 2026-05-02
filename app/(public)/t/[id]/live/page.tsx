import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { MatchBoard } from "@/components/tournament/MatchBoard";
import { ScoreBoard } from "@/components/tournament/ScoreBoard";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Vue Live — DartsOpen" };

export default async function LivePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, nb_boards, nb_pools")
    .eq("id", id)
    .single();

  if (!tournament || !["IN_PROGRESS", "FINISHED"].includes(tournament.status)) {
    notFound();
  }

  // Matchs en cours et à venir
  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id, board_number, status,
      player1:registrations!matches_player1_id_fkey(id, player_name),
      player2:registrations!matches_player2_id_fkey(id, player_name),
      match_sets(id, round_order, winner_id, validated_p1, validated_p2)
    `)
    .eq("tournament_id", id)
    .in("status", ["IN_PROGRESS", "PENDING"])
    .order("board_number")
    .order("created_at");

  // Poules et classements
  const { data: pools } = await supabase
    .from("pools")
    .select(`
      id, name,
      pool_players(
        registration_id,
        registrations(player_name)
      )
    `)
    .eq("tournament_id", id)
    .order("name");

  const { data: finishedMatches } = await supabase
    .from("matches")
    .select("player1_id, player2_id, winner_id, pool_id")
    .eq("tournament_id", id)
    .eq("status", "FINISHED");

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🎯 {tournament.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Tableau de bord en direct</p>
        </div>
        {tournament.status === "IN_PROGRESS" && (
          <span className="rounded-full bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 text-xs font-medium animate-pulse">
            ● EN DIRECT
          </span>
        )}
      </div>

      {/* MatchBoard temps réel */}
      <MatchBoard
        tournamentId={id}
        initialMatches={matches ?? []}
        nbBoards={tournament.nb_boards}
      />

      {/* ScoreBoard par poule */}
      <ScoreBoard
        tournamentId={id}
        pools={pools ?? []}
        finishedMatches={finishedMatches ?? []}
      />
    </div>
  );
}
