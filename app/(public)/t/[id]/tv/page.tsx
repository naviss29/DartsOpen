import { notFound } from "next/navigation";
import { dbGetTournamentPublic, dbListMatches } from "@/lib/db/tournament";
import { TvBoard } from "@/components/tournament/TvBoard";
import { LandscapeGuard } from "@/components/ui/LandscapeGuard";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Mode TV — DartsOpen" };

type PublicTournament = {
  id: string;
  name: string;
  status: string;
  nb_boards: number;
};

type PublicMatch = {
  id: string;
  board_number: number;
  status: string;
  player1: { id: string; player_name: string };
  player2: { id: string; player_name: string };
  winner_id: string | null;
  sets: { winner_id: string | null }[];
};

export default async function TvPage({ params }: Props) {
  const { id } = await params;

  const tournament = (await dbGetTournamentPublic(id).catch(() => null)) as PublicTournament | null;
  if (!tournament) notFound();

  const matches = (await dbListMatches(id).catch(() => [])) as PublicMatch[];

  return (
    <LandscapeGuard>
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden p-6 gap-5">
      {/* Header compact */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black tracking-tight">🎯 {tournament.name}</h1>
          <p className="text-gray-600 text-xs tracking-widest uppercase mt-0.5">
            Affichage temps réel · actualisation toutes les 5 s
          </p>
        </div>
        <div className="flex items-center gap-4">
          {tournament.status === "IN_PROGRESS" && (
            <span className="rounded-full bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-1.5 text-sm font-bold animate-pulse">
              ● EN DIRECT
            </span>
          )}
          {tournament.status === "FINISHED" && (
            <span className="rounded-full bg-gray-700/50 text-gray-400 border border-gray-600 px-4 py-1.5 text-sm font-medium">
              Terminé
            </span>
          )}
          <Link href={`/t/${id}/live`} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Vue normale →
          </Link>
        </div>
      </div>

      {/* Contenu principal — occupe tout l'espace restant */}
      {!["IN_PROGRESS", "FINISHED"].includes(tournament.status) ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-lg">
          Le tournoi n&apos;a pas encore commencé.
        </div>
      ) : (
        <TvBoard tournamentId={id} initialMatches={matches} nbBoards={tournament.nb_boards} />
      )}
    </div>
    </LandscapeGuard>
  );
}
