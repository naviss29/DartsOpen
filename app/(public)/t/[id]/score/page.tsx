import { notFound } from "next/navigation";
import { ScoreForm } from "@/components/tournament/ScoreForm";
import { dbGetTournamentPublic, dbListMatches } from "@/lib/db/tournament";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ board?: string }>;
}

export const metadata: Metadata = { title: "Saisie du score — DartsOpen" };

type SterMatch = {
  id: string;
  board_number: number;
  status: string;
  player1_id: string;
  player2_id: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
  sets: {
    id: string;
    round_order: number;
    winner_id: string | null;
    validated_p1: boolean;
    validated_p2: boolean;
  }[];
};

export default async function ScorePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { board } = await searchParams;
  const boardNumber = parseInt(board ?? "1", 10);

  const [tournament, allMatches] = await Promise.all([
    dbGetTournamentPublic(id).catch(() => null) as Promise<{ id: string; name: string; status: string; scoring_mode: string; rounds: { id: string; order: number; game_type: string; entry_type: string; finish_type: string }[] } | null>,
    dbListMatches(id).catch(() => []) as Promise<SterMatch[]>,
  ]);

  if (!tournament || tournament.status !== "IN_PROGRESS") notFound();

  const rawMatch = allMatches.find(
    (m) => m.board_number === boardNumber && m.status === "IN_PROGRESS"
  ) ?? null;

  // Map SterPlatform format to ScoreForm interface
  const match = rawMatch ? {
    id: rawMatch.id,
    board_number: rawMatch.board_number,
    player1: rawMatch.player1,
    player2: rawMatch.player2,
    match_sets: rawMatch.sets.map((s) => ({
      id: s.id,
      round_order: s.round_order,
      winner_id: s.winner_id,
      validated_p1: s.validated_p1,
      validated_p2: s.validated_p2,
      winner: s.winner_id
        ? { player_name: s.winner_id === rawMatch.player1_id ? rawMatch.player1.player_name : rawMatch.player2.player_name }
        : null,
    })),
  } : null;

  const rounds = tournament.rounds ?? [];

  return (
    <div className="min-h-screen flex flex-col">
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
            match={match}
            rounds={rounds}
            scoringMode={tournament.scoring_mode === "TRADITIONAL" ? "TRADITIONAL" : "ELECTRONIC"}
            tournamentId={id}
          />
        )}
      </div>
    </div>
  );
}
