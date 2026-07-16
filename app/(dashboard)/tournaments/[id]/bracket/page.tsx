import { redirect } from "next/navigation";
import { generateBracket, advanceToNextRound } from "@/lib/actions/bracket";
import { generateQuickBracket } from "@/lib/actions/quickTournament";
import { BracketView } from "@/components/tournament/BracketView";
import { QuickBracketView } from "@/components/tournament/QuickBracketView";
import { dbListMatches } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Phases finales — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  status: string;
  nb_pools: number;
  advancement_per_pool: number;
  nb_boards: number;
  quick_mode: boolean;
};

type BracketMatch = {
  id: string;
  bracket_round: number;
  bracket_position: number;
  bracket_type: string;
  board_number: number;
  status: string;
  winner_id: string | null;
  pool_id: string | null;
  player1: { id: string; player_name: string; lives: number } | null;
  player2: { id: string; player_name: string; lives: number } | null;
  sets: { id: string; round_order: number; winner_id: string | null }[];
};

export default async function BracketPage({ params }: Props) {
  const { id } = await params;

  const tournament = await getOwnedTournament(id) as Tournament;
  if (!["IN_PROGRESS", "FINISHED"].includes(tournament.status)) {
    redirect(`/tournaments/${id}/pools`);
  }

  const allMatches = await dbListMatches(id).catch(() => []) as BracketMatch[];
  const bracketMatches = allMatches.filter((m) => m.pool_id === null && m.bracket_round !== null);
  const poolMatches = allMatches.filter((m) => m.pool_id !== null);

  const poolsPending = tournament.nb_pools === 1
    ? false
    : poolMatches.length === 0 || poolMatches.some((m) => m.status !== "FINISHED");

  // Auto-génération du bracket pour les tournois à poule unique (mode STANDARD uniquement)
  if (
    !tournament.quick_mode &&
    tournament.nb_pools === 1 &&
    tournament.status === "IN_PROGRESS" &&
    bracketMatches.length === 0
  ) {
    const result = await generateBracket(id);
    if (!result.error) redirect(`/tournaments/${id}/bracket`);
  }

  const hasBracket = bracketMatches.length > 0;

  // ── Mode standard : calcul du tour courant ──────────────────────────────────
  const maxRound = hasBracket && !tournament.quick_mode
    ? Math.max(...bracketMatches.map((m) => m.bracket_round))
    : 0;

  const currentRoundMatches = maxRound > 0
    ? bracketMatches.filter((m) => m.bracket_round === maxRound)
    : [];

  const currentRoundFinished =
    maxRound > 0 && currentRoundMatches.every((m) => m.status === "FINISHED");

  const tournamentFinished = tournament.status === "FINISHED";

  // Vainqueur : Grande Finale (quickMode) ou dernier match (standard)
  const winnerMatch = tournamentFinished
    ? tournament.quick_mode
      ? (bracketMatches.find((m) => m.bracket_type === "GRAND_FINAL" && m.winner_id) ??
         bracketMatches.filter((m) => m.winner_id).sort((a, b) => (b.bracket_round ?? 0) - (a.bracket_round ?? 0))[0])
      : (currentRoundMatches.length === 1 ? currentRoundMatches[0] : null)
    : null;

  const winnerName = winnerMatch?.winner_id
    ? (winnerMatch.player1?.id === winnerMatch.winner_id
        ? winnerMatch.player1?.player_name
        : winnerMatch.player2?.player_name)
    : null;

  async function doGenerateBracket() {
    "use server";
    await generateBracket(id);
  }

  async function doGenerateQuickBracket() {
    "use server";
    await generateQuickBracket(id);
  }

  async function doAdvanceToNextRound() {
    "use server";
    await advanceToNextRound(id, maxRound);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {tournament.name}
        </Link>
        <nav className="flex items-center gap-2 flex-wrap">
          <Link href={`/tournaments/${id}/players`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
            👥 Joueurs
          </Link>
          {!tournament.quick_mode && (
            <Link href={`/tournaments/${id}/pools`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
              🏆 Poules & Matchs
            </Link>
          )}
          <Link href={`/tournaments/${id}/bracket`} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
            {tournament.quick_mode ? "⚡ Bracket rapide" : "🥇 Phases finales"}
          </Link>
          {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
            <Link href={`/t/${id}/live`} target="_blank" className="rounded-lg border border-green-500 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
              🎯 Vue Live ↗
            </Link>
          )}
        </nav>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {tournament.quick_mode ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Tournoi rapide ⚡</h1>
              <p className="text-sm text-gray-500 mt-1">Double élimination — 2 vies par joueur</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Phases finales</h1>
              <p className="text-sm text-gray-500 mt-1">
                {tournament.nb_pools} poules · {tournament.advancement_per_pool} qualifié(s)/poule
                · {tournament.nb_pools * tournament.advancement_per_pool} participants
              </p>
            </>
          )}
        </div>

        {tournament.status === "IN_PROGRESS" && !hasBracket && (
          <div className="flex flex-col items-end gap-2">
            {tournament.quick_mode ? (
              <form action={doGenerateQuickBracket}>
                <button
                  type="submit"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  ⚡ Générer le bracket rapide
                </button>
              </form>
            ) : (
              <>
                <form action={doGenerateBracket}>
                  <button
                    type="submit"
                    disabled={poolsPending}
                    title={poolsPending ? "Des matchs de poules sont encore en cours" : ""}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Générer les phases finales
                  </button>
                </form>
                {poolsPending && (
                  <p className="text-xs text-orange-600">
                    Des matchs de poule sont encore en cours.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bouton "Tour suivant" uniquement en mode standard */}
      {!tournament.quick_mode && hasBracket && currentRoundFinished && !tournamentFinished && tournament.status === "IN_PROGRESS" && (
        <div className="flex justify-end">
          <form action={doAdvanceToNextRound}>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Tour suivant →
            </button>
          </form>
        </div>
      )}

      {/* Bandeau vainqueur */}
      {tournamentFinished && winnerName && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-6 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <h2 className="text-xl font-bold text-yellow-800">Vainqueur du tournoi</h2>
          <p className="text-2xl font-bold text-yellow-900">{winnerName}</p>
        </div>
      )}

      {hasBracket ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {tournament.quick_mode ? (
            <QuickBracketView matches={bracketMatches} tournamentId={id} />
          ) : (
            <BracketView
              matches={bracketMatches}
              maxRound={maxRound}
              tournamentId={id}
            />
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <p className="text-gray-500">
            {tournament.quick_mode
              ? "Cliquez sur « Générer le bracket rapide » pour démarrer le tournoi."
              : poolsPending
              ? "Terminez tous les matchs de poules pour débloquer les phases finales."
              : tournament.nb_pools === 1
              ? "Génération des phases finales en cours…"
              : tournament.status !== "IN_PROGRESS"
              ? "Démarrez le tournoi pour accéder aux phases finales."
              : "Cliquez sur « Générer les phases finales » pour créer le tableau."}
          </p>
        </div>
      )}
    </div>
  );
}
