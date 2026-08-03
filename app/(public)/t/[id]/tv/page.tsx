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
    <div className="h-screen bg-darts-bg text-darts-text flex flex-col overflow-hidden p-6 gap-5">
      {/* Header compact */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black tracking-tight">🎯 {tournament.name}</h1>
          <p className="text-darts-text-secondary text-xs tracking-widest uppercase mt-0.5">
            Affichage temps réel · actualisation toutes les 5 s
          </p>
        </div>
        <div className="flex items-center gap-4">
          {tournament.status === "IN_PROGRESS" && (
            <span className="rounded-full bg-darts-green/20 text-darts-green border border-darts-green/30 px-4 py-1.5 text-sm font-bold animate-pulse">
              ● EN DIRECT
            </span>
          )}
          {tournament.status === "FINISHED" && (
            <span className="rounded-full bg-darts-surface-raised/60 text-darts-text-secondary border border-darts-border px-4 py-1.5 text-sm font-medium">
              Terminé
            </span>
          )}
          <Link href={`/t/${id}/live`} className="text-xs text-darts-text-secondary hover:text-darts-text transition-colors">
            Vue normale →
          </Link>
        </div>
      </div>

      {/* Contenu principal — occupe tout l'espace restant */}
      {!["IN_PROGRESS", "FINISHED"].includes(tournament.status) ? (
        <div className="flex-1 flex items-center justify-center text-darts-text-secondary text-lg">
          Le tournoi n&apos;a pas encore commencé.
        </div>
      ) : (
        <TvBoard tournamentId={id} initialMatches={matches} nbBoards={tournament.nb_boards} />
      )}
    </div>
    </LandscapeGuard>
  );
}
