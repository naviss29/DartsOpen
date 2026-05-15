import { notFound } from "next/navigation";
import { MatchBoard } from "@/components/tournament/MatchBoard";
import { ScoreBoard } from "@/components/tournament/ScoreBoard";
import { BracketLive } from "@/components/tournament/BracketLive";
import { apiGetTournamentPublic, apiListMatchesPublic, apiListPoolsPublic } from "@/lib/api/tournament";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Vue Live — DartsOpen" };

type SterMatch = {
  id: string;
  board_number: number;
  status: string;
  bracket_round: number | null;
  bracket_position: number | null;
  pool_id: string | null;
  player1_id: string;
  player2_id: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
  winner_id: string | null;
  sets: { id: string; round_order: number; winner_id: string | null; validated_p1: boolean; validated_p2: boolean }[];
};

type SterPool = {
  id: string;
  name: string;
  players: { id: string; player_name: string }[];
  matches: { id: string; status: string; player1_id: string; player2_id: string; winner_id: string | null; pool_id: string }[];
};

export default async function LivePage({ params }: Props) {
  const { id } = await params;

  const tournament = await apiGetTournamentPublic(id) as {
    id: string;
    name: string;
    status: string;
    nb_boards: number;
    nb_pools: number;
  } | null;

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

  const [allMatches, pools] = await Promise.all([
    apiListMatchesPublic(id) as Promise<SterMatch[]>,
    apiListPoolsPublic(id) as Promise<SterPool[]>,
  ]);

  // Matches for the board (IN_PROGRESS + PENDING)
  const activeMatches = allMatches
    .filter((m) => ["IN_PROGRESS", "PENDING"].includes(m.status))
    .map((m) => ({
      id: m.id,
      board_number: m.board_number,
      status: m.status,
      player1: m.player1,
      player2: m.player2,
      sets: m.sets,
    }));

  // Bracket matches
  const bracketMatches = allMatches
    .filter((m) => m.pool_id === null && m.bracket_round !== null)
    .map((m) => ({
      id: m.id,
      bracket_round: m.bracket_round as number,
      bracket_position: m.bracket_position as number,
      status: m.status,
      winner_id: m.winner_id,
      player1: m.player1,
      player2: m.player2,
    }));

  // Finished pool matches for scoreboard
  const finishedPoolMatches = allMatches
    .filter((m) => m.pool_id !== null && m.status === "FINISHED")
    .map((m) => ({
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      winner_id: m.winner_id,
      pool_id: m.pool_id as string,
    }));

  const hasBracket = bracketMatches.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
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

      <MatchBoard
        tournamentId={id}
        initialMatches={activeMatches}
        nbBoards={tournament.nb_boards}
      />

      {hasBracket && (
        <BracketLive
          tournamentId={id}
          initialMatches={bracketMatches}
        />
      )}

      {!hasBracket && (
        <ScoreBoard
          tournamentId={id}
          pools={pools}
          finishedMatches={finishedPoolMatches}
        />
      )}
    </div>
  );
}
