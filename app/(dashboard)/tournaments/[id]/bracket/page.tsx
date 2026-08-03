import { redirect } from "next/navigation";
import { generateBracket, advanceToNextRound } from "@/lib/actions/bracket";
import { generateQuickBracket } from "@/lib/actions/quickTournament";
import { BracketView } from "@/components/tournament/BracketView";
import { QuickBracketView } from "@/components/tournament/QuickBracketView";
import { dbListMatches } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import Button from "@/components/ui/Button";
import NavPills from "@/components/ui/NavPills";
import { Card, EmptyState } from "@naviss29/design-system";
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
        <Link href={`/tournaments/${id}`} className="text-sm text-brand-text-secondary hover:text-brand-dark">
          ← {tournament.name}
        </Link>
        <NavPills
          items={[
            { href: `/tournaments/${id}/players`, label: "👥 Joueurs" },
            ...(tournament.quick_mode ? [] : [{ href: `/tournaments/${id}/pools`, label: "🏆 Poules & Matchs" }]),
            { href: `/tournaments/${id}/bracket`, label: tournament.quick_mode ? "⚡ Bracket rapide" : "🥇 Phases finales", current: true },
          ]}
        />
        {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
          <Link
            href={`/t/${id}/live`}
            target="_blank"
            className="inline-block rounded-lg border border-brand-turquoise bg-brand-turquoise/10 px-4 py-2 text-sm font-medium text-brand-turquoise hover:bg-brand-turquoise/20 transition-colors"
          >
            🎯 Vue Live ↗
          </Link>
        )}
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {tournament.quick_mode ? (
            <>
              <h1 className="text-2xl font-bold text-brand-dark">Tournoi rapide ⚡</h1>
              <p className="text-sm text-brand-text-secondary mt-1">Double élimination — 2 vies par joueur</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-brand-dark">Phases finales</h1>
              <p className="text-sm text-brand-text-secondary mt-1">
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
                <Button type="submit">⚡ Générer le bracket rapide</Button>
              </form>
            ) : (
              <>
                <form action={doGenerateBracket}>
                  <Button
                    type="submit"
                    disabled={poolsPending}
                    title={poolsPending ? "Des matchs de poules sont encore en cours" : ""}
                  >
                    Générer les phases finales
                  </Button>
                </form>
                {poolsPending && (
                  <p className="text-xs text-amber-600">
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
            <Button type="submit">Tour suivant →</Button>
          </form>
        </div>
      )}

      {/* Bandeau vainqueur */}
      {tournamentFinished && winnerName && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <h2 className="text-xl font-bold text-emerald-800">Vainqueur du tournoi</h2>
          <p className="text-2xl font-bold text-emerald-800">{winnerName}</p>
        </div>
      )}

      {hasBracket ? (
        <Card>
          {tournament.quick_mode ? (
            <QuickBracketView matches={bracketMatches} tournamentId={id} />
          ) : (
            <BracketView
              matches={bracketMatches}
              maxRound={maxRound}
              tournamentId={id}
            />
          )}
        </Card>
      ) : (
        <EmptyState
          title="Phases finales pas encore disponibles"
          description={
            tournament.quick_mode
              ? "Cliquez sur « Générer le bracket rapide » pour démarrer le tournoi."
              : poolsPending
              ? "Terminez tous les matchs de poules pour débloquer les phases finales."
              : tournament.nb_pools === 1
              ? "Génération des phases finales en cours…"
              : tournament.status !== "IN_PROGRESS"
              ? "Démarrez le tournoi pour accéder aux phases finales."
              : "Cliquez sur « Générer les phases finales » pour créer le tableau."
          }
        />
      )}
    </div>
  );
}
