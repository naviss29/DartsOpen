import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { generateBracket, advanceToNextRound } from "@/lib/actions/bracket";
import { BracketView } from "@/components/tournament/BracketView";
import Link from "next/link";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Phases finales — DartsOpen" };

export default async function BracketPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, nb_pools, advancement_per_pool, nb_boards")
    .eq("id", id)
    .eq("association_id", user!.id)
    .single();

  if (!tournament) notFound();
  if (!["IN_PROGRESS", "FINISHED"].includes(tournament.status)) {
    redirect(`/tournaments/${id}/pools`);
  }

  // Matchs de bracket
  const { data: bracketMatches } = await supabase
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

  // Vérifier si les poules sont toutes terminées
  const { count: pendingPoolCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", id)
    .not("pool_id", "is", null)
    .neq("status", "FINISHED");

  const poolsPending = (pendingPoolCount ?? 0) > 0;

  // Supabase retourne les joins FK comme tableaux — on normalise en objets
  const normalizedMatches = (bracketMatches ?? []).map((m) => ({
    ...m,
    player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
    player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
  }));

  const hasBracket = normalizedMatches.length > 0;

  const maxRound = hasBracket
    ? Math.max(...normalizedMatches.map((m) => m.bracket_round))
    : 0;

  const currentRoundMatches = hasBracket
    ? normalizedMatches.filter((m) => m.bracket_round === maxRound)
    : [];

  const currentRoundFinished =
    hasBracket && currentRoundMatches.every((m) => m.status === "FINISHED");

  const tournamentFinished =
    hasBracket && currentRoundMatches.length === 1 && currentRoundFinished;

  const winner = tournamentFinished
    ? currentRoundMatches[0].winner_id
    : null;

  const winnerName = winner
    ? (currentRoundMatches[0].player1?.id === winner
        ? currentRoundMatches[0].player1?.player_name
        : currentRoundMatches[0].player2?.player_name)
    : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + onglets */}
      <div className="space-y-3">
        <Link href={`/tournaments/${id}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← {tournament.name}
        </Link>
        <nav className="flex items-center gap-2 flex-wrap">
          <Link href={`/tournaments/${id}/players`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
            👥 Joueurs
          </Link>
          <Link href={`/tournaments/${id}/pools`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors">
            🏆 Poules & Matchs
          </Link>
          <Link href={`/tournaments/${id}/bracket`} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
            🥇 Phases finales
          </Link>
          {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
            <Link href={`/t/${id}/live`} target="_blank" className="rounded-lg border border-green-500 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
              🎯 Vue Live ↗
            </Link>
          )}
        </nav>
      </div>

      {/* En-tête + actions */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phases finales</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tournament.nb_pools} poules · {tournament.advancement_per_pool} qualifié(s)/poule
            · {tournament.nb_pools * tournament.advancement_per_pool} participants
          </p>
        </div>

        {/* Bouton générer / tour suivant */}
        {tournament.status === "IN_PROGRESS" && !tournamentFinished && (
          <div className="flex flex-col items-end gap-2">
            {!hasBracket ? (
              <form action={generateBracket.bind(null, id)}>
                <button
                  type="submit"
                  disabled={poolsPending}
                  title={poolsPending ? "Des matchs de poules sont encore en cours" : ""}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Générer les phases finales
                </button>
              </form>
            ) : currentRoundFinished ? (
              <form action={advanceToNextRound.bind(null, id, maxRound)}>
                <button
                  type="submit"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                >
                  Lancer le tour suivant →
                </button>
              </form>
            ) : null}

            {poolsPending && !hasBracket && (
              <p className="text-xs text-orange-600">
                {pendingPoolCount} match(s) de poule encore en cours
              </p>
            )}
          </div>
        )}
      </div>

      {/* Vainqueur */}
      {tournamentFinished && winnerName && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-6 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <h2 className="text-xl font-bold text-yellow-800">Vainqueur du tournoi</h2>
          <p className="text-2xl font-bold text-yellow-900">{winnerName}</p>
        </div>
      )}

      {/* Bracket */}
      {hasBracket ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <BracketView
            matches={normalizedMatches}
            maxRound={maxRound}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <p className="text-gray-500">
            {poolsPending
              ? "Terminez tous les matchs de poules pour débloquer les phases finales."
              : tournament.status !== "IN_PROGRESS"
              ? "Démarrez le tournoi pour accéder aux phases finales."
              : "Cliquez sur « Générer les phases finales » pour créer le tableau."}
          </p>
        </div>
      )}
    </div>
  );
}
