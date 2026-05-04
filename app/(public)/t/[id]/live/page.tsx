import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { MatchBoard } from "@/components/tournament/MatchBoard";
import { ScoreBoard } from "@/components/tournament/ScoreBoard";
import { BracketLive } from "@/components/tournament/BracketLive";
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

  if (!tournament) notFound();

  if (!["IN_PROGRESS", "FINISHED"].includes(tournament.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="text-5xl">🎯</div>
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <p className="text-gray-400">Le tournoi n&apos;a pas encore commencé.</p>
          <p className="text-gray-500 text-sm">Cette page se mettra à jour automatiquement au démarrage.</p>
        </div>
      </div>
    );
  }

  // Matchs en cours et à venir
  const { data: rawMatches } = await supabase
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

  // Supabase retourne les joins FK comme tableaux — on normalise en objets
  const matches = (rawMatches ?? []).map((m) => ({
    ...m,
    player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
    player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
  }));

  // Poules et classements
  const { data: rawPools } = await supabase
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

  // Supabase retourne les joins FK comme tableaux — on normalise registrations en objet
  const pools = (rawPools ?? []).map((pool) => ({
    ...pool,
    pool_players: pool.pool_players.map((pp) => ({
      ...pp,
      registrations: Array.isArray(pp.registrations) ? pp.registrations[0] : pp.registrations,
    })),
  }));

  const { data: finishedMatches } = await supabase
    .from("matches")
    .select("player1_id, player2_id, winner_id, pool_id")
    .eq("tournament_id", id)
    .eq("status", "FINISHED");

  // Matchs de bracket (phases finales)
  const { data: rawBracketMatches } = await supabase
    .from("matches")
    .select(`
      id, bracket_round, bracket_position, status, winner_id,
      player1:registrations!matches_player1_id_fkey(id, player_name),
      player2:registrations!matches_player2_id_fkey(id, player_name)
    `)
    .eq("tournament_id", id)
    .is("pool_id", null)
    .order("bracket_round")
    .order("bracket_position");

  const bracketMatches = (rawBracketMatches ?? []).map((m) => ({
    ...m,
    player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
    player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
  }));

  const hasBracket = bracketMatches.length > 0;

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
        initialMatches={matches}
        nbBoards={tournament.nb_boards}
      />

      {/* Phase finale : tableau de bracket */}
      {hasBracket && (
        <BracketLive
          tournamentId={id}
          initialMatches={bracketMatches}
        />
      )}

      {/* Phase de poules : classements par poule */}
      {!hasBracket && (
        <ScoreBoard
          tournamentId={id}
          pools={pools}
          finishedMatches={finishedMatches ?? []}
        />
      )}
    </div>
  );
}
