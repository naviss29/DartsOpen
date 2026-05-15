import { notFound } from "next/navigation";
import { RoundForm } from "@/components/tournament/RoundForm";
import { DeleteRoundButton } from "@/components/tournament/DeleteRoundButton";
import { TournamentStatusButton } from "@/components/tournament/TournamentStatusButton";
import { EditTournamentForm } from "@/components/tournament/EditTournamentForm";
import { apiGetTournament, apiListRegistrations, apiListPools } from "@/lib/api/tournament";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
  max_players: number;
  players_per_team: number;
  nb_pools: number;
  nb_boards: number;
  entry_fee: number;
  advancement_per_pool: number;
  registration_mode: string;
  scoring_mode: string;
  rounds: { id: string; order: number; game_type: string; entry_type: string; finish_type: string }[];
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tournament = await apiGetTournament(id) as Tournament | null;
  return { title: tournament ? `${tournament.name} — DartsOpen` : "Tournoi — DartsOpen" };
}

export default async function TournamentDetailPage({ params }: Props) {
  const { id } = await params;

  const [tournament, registrations, pools] = await Promise.all([
    apiGetTournament(id) as Promise<Tournament | null>,
    apiListRegistrations(id, "PAID") as Promise<{ id: string }[]>,
    apiListPools(id) as Promise<{ id: string }[]>,
  ]);

  if (!tournament) notFound();

  const playerCount = registrations.length;
  const poolCount = pools.length;

  const rounds = [...(tournament.rounds ?? [])].sort((a, b) => a.order - b.order);

  const GAME_LABELS: Record<string, string> = {
    "501": "501", "701": "701", "901": "901", "1001": "1001", CRICKET: "Cricket",
  };
  const TYPE_LABELS: Record<string, string> = {
    SINGLE: "Simple", DOUBLE: "Double", TRIPLE: "Triple", MASTER: "Master",
  };

  const nextStatus: Record<string, string> = {
    DRAFT: "OPEN", OPEN: "IN_PROGRESS", IN_PROGRESS: "FINISHED",
  };

  const nextStatusLabel: Record<string, string> = {
    DRAFT: "Ouvrir les inscriptions",
    OPEN: "Démarrer le tournoi",
    IN_PROGRESS: "Clôturer le tournoi",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            📅 {new Date(tournament.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp;
            📍 {tournament.location}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={tournament.status} />
          {nextStatus[tournament.status] && (
            <TournamentStatusButton
              tournamentId={id}
              nextStatus={nextStatus[tournament.status]}
              label={nextStatusLabel[tournament.status]}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Joueurs max", value: tournament.max_players },
          { label: "Joueurs / équipe", value: tournament.players_per_team },
          { label: "Poules", value: tournament.nb_pools },
          { label: "Cibles", value: tournament.nb_boards },
          { label: "Inscription", value: `${(tournament.entry_fee / 100).toFixed(2)} €` },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{item.value}</p>
            <p className="text-xs text-gray-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <nav className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/tournaments/${id}/players`}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
        >
          👥 Joueurs
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {playerCount * tournament.players_per_team}/{tournament.max_players}
          </span>
        </Link>

        <Link
          href={`/tournaments/${id}/pools`}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
        >
          🏆 Poules & Matchs
          {poolCount > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {poolCount}
            </span>
          )}
        </Link>

        <Link
          href={`/tournaments/${id}/bracket`}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
        >
          🥇 Phases finales
        </Link>

        {tournament.status === "OPEN" && tournament.registration_mode === "ONLINE" && (
          <Link
            href={`/t/${id}/register`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-blue-500 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            📝 Page d&apos;inscription
            <span className="text-xs opacity-70">↗</span>
          </Link>
        )}
        {tournament.status === "OPEN" && tournament.registration_mode === "ONSITE" && (
          <p className="text-sm text-gray-500 italic">
            📍 Inscriptions sur place — ajoutez les équipes via <Link href={`/tournaments/${id}/players`} className="text-green-700 font-medium underline underline-offset-2">Joueurs</Link>
          </p>
        )}

        {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
          <Link
            href={`/t/${id}/live`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-green-500 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
          >
            🎯 Vue Live
            <span className="text-xs opacity-70">↗</span>
          </Link>
        )}
      </nav>

      {tournament.status === "DRAFT" && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <EditTournamentForm tournament={tournament} />
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">
          Manches ({rounds.length})
        </h2>

        {rounds.length > 0 && (
          <div className="space-y-2">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-500 w-6">
                    #{round.order}
                  </span>
                  <span className="font-medium text-gray-900">
                    {GAME_LABELS[round.game_type]}
                  </span>
                  <span className="text-sm text-gray-500">
                    Entrée : {TYPE_LABELS[round.entry_type]} · Sortie : {TYPE_LABELS[round.finish_type]}
                  </span>
                </div>
                {tournament.status === "DRAFT" && (
                  <DeleteRoundButton roundId={round.id} tournamentId={id} />
                )}
              </div>
            ))}
          </div>
        )}

        {tournament.status === "DRAFT" && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3">Ajouter une manche</p>
            <RoundForm tournamentId={id} />
          </div>
        )}

        {rounds.length === 0 && tournament.status !== "DRAFT" && (
          <p className="text-sm text-gray-500">Aucune manche configurée.</p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    OPEN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-green-100 text-green-700",
    FINISHED: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    DRAFT: "Brouillon",
    OPEN: "Inscriptions ouvertes",
    IN_PROGRESS: "En cours",
    FINISHED: "Terminé",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
