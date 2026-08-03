import { RoundForm } from "@/components/tournament/RoundForm";
import { DeleteRoundButton } from "@/components/tournament/DeleteRoundButton";
import { TournamentStatusButton } from "@/components/tournament/TournamentStatusButton";
import { EditTournamentForm } from "@/components/tournament/EditTournamentForm";
import { dbListRegistrations, dbListPools } from "@/lib/db/tournament";
import { getOwnedTournament } from "@/lib/actions/access";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, Pill } from "@naviss29/design-system";
import StatusBadge from "@/components/ui/StatusBadge";
import NavPills from "@/components/ui/NavPills";

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
  quick_mode: boolean;
  rounds: { id: string; order: number; game_type: string; entry_type: string; finish_type: string }[];
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tournament = await getOwnedTournament(id) as Tournament;
  return { title: `${tournament.name} — DartsOpen` };
}

export default async function TournamentDetailPage({ params }: Props) {
  const { id } = await params;

  const tournament = await getOwnedTournament(id) as Tournament;

  const [registrations, pools] = await Promise.all([
    dbListRegistrations(id, "PAID").catch(() => []) as Promise<{ id: string }[]>,
    dbListPools(id).catch(() => []) as Promise<{ id: string }[]>,
  ]);

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-brand-dark">{tournament.name}</h1>
            {tournament.quick_mode && <Pill tone="success">⚡ Mode rapide</Pill>}
          </div>
          <p className="mt-1 text-sm text-brand-text-secondary">
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: "Joueurs max", value: tournament.max_players },
          { label: "Joueurs / équipe", value: tournament.players_per_team },
          { label: "Poules", value: tournament.nb_pools },
          { label: "Cibles", value: tournament.nb_boards },
          { label: "Inscription", value: `${(tournament.entry_fee / 100).toFixed(2)} €` },
        ].map((item) => (
          <Card key={item.label} className="text-center">
            <p className="text-2xl font-bold text-brand-dark">{item.value}</p>
            <p className="mt-1 text-xs text-brand-text-secondary">{item.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NavPills
          items={[
            {
              href: `/tournaments/${id}/players`,
              label: "👥 Joueurs",
              badge: `${playerCount * tournament.players_per_team}/${tournament.max_players}`,
            },
            {
              href: `/tournaments/${id}/pools`,
              label: "🏆 Poules & Matchs",
              badge: poolCount > 0 ? poolCount : undefined,
            },
            { href: `/tournaments/${id}/bracket`, label: "🥇 Phases finales" },
          ]}
        />

        {tournament.status === "OPEN" && tournament.registration_mode === "ONLINE" && (
          <Link
            href={`/t/${id}/register`}
            target="_blank"
            className="flex items-center gap-2 rounded-lg border border-brand-turquoise bg-brand-turquoise/10 px-4 py-2.5 text-sm font-medium text-brand-turquoise transition-colors hover:bg-brand-turquoise/20"
          >
            📝 Page d&apos;inscription
            <span className="text-xs opacity-70">↗</span>
          </Link>
        )}
        {tournament.status === "OPEN" && tournament.registration_mode === "ONSITE" && (
          <p className="text-sm text-brand-text-secondary italic">
            📍 Inscriptions sur place — ajoutez les équipes via{" "}
            <Link href={`/tournaments/${id}/players`} className="font-medium text-brand-turquoise underline underline-offset-2">
              Joueurs
            </Link>
          </p>
        )}

        {["IN_PROGRESS", "FINISHED"].includes(tournament.status) && (
          <>
            <Link
              href={`/t/${id}/live`}
              target="_blank"
              className="flex items-center gap-2 rounded-lg border border-brand-turquoise bg-brand-turquoise/10 px-4 py-2.5 text-sm font-medium text-brand-turquoise transition-colors hover:bg-brand-turquoise/20"
            >
              🎯 Vue Live
              <span className="text-xs opacity-70">↗</span>
            </Link>
            <Link
              href={`/t/${id}/tv`}
              target="_blank"
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:bg-slate-100"
            >
              📺 Mode TV
              <span className="text-xs opacity-70">↗</span>
            </Link>
          </>
        )}
      </div>

      {tournament.status === "DRAFT" && (
        <section>
          <Card>
            <EditTournamentForm tournament={tournament} />
          </Card>
        </section>
      )}

      {tournament.quick_mode && tournament.status !== "DRAFT" && (
        <div className="rounded-xl border border-brand-turquoise/30 bg-brand-turquoise/10 p-4">
          <p className="text-sm font-medium text-brand-turquoise">⚡ Mode tournoi rapide</p>
          <p className="mt-1 text-xs text-brand-turquoise/80">
            Double élimination — 2 vies par joueur. Les manches (501 → Cricket → 701) sont générées automatiquement selon la phase.
          </p>
        </div>
      )}

      {!tournament.quick_mode && (
      <section>
        <Card className="space-y-4">
          <h2 className="font-semibold text-brand-dark">
            Manches ({rounds.length})
          </h2>

          {rounds.length > 0 && (
            <div className="space-y-2">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-6 text-sm font-medium text-brand-text-secondary">
                      #{round.order}
                    </span>
                    <span className="font-medium text-brand-dark">
                      {GAME_LABELS[round.game_type]}
                    </span>
                    <span className="text-sm text-brand-text-secondary">
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
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs text-brand-text-secondary">Ajouter une manche</p>
              <RoundForm tournamentId={id} />
            </div>
          )}

          {rounds.length === 0 && tournament.status !== "DRAFT" && (
            <p className="text-sm text-brand-text-secondary">Aucune manche configurée.</p>
          )}
        </Card>
      </section>
      )}
    </div>
  );
}
