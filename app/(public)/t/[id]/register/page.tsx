import { notFound } from "next/navigation";
import { RegisterTeamForm } from "@/components/tournament/RegisterTeamForm";
import { dbGetTournamentPublic, dbCountRegistrations } from "@/lib/db/tournament";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }

export const metadata: Metadata = { title: "Inscription — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  entry_fee: number;
  max_players: number;
  players_per_team: number;
  registration_mode: string;
  status: string;
  registered_count: number;
};

export default async function RegisterPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { cancelled } = await searchParams;

  const tournament = await dbGetTournamentPublic(id).catch(() => null) as Tournament | null;
  if (!tournament || tournament.status !== "OPEN") notFound();

  const count = await dbCountRegistrations(id, "PAID").catch(() => 0);
  const isFull = count * tournament.players_per_team >= tournament.max_players;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="DartsOpen" width={118} height={50} className="h-6 w-auto mx-auto" />
          <h1 className="text-2xl font-bold text-brand-dark">{tournament.name}</h1>
          <p className="text-brand-text-secondary text-sm">
            📅 {new Date(tournament.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp;
            📍 {tournament.location}
          </p>
          <p className="text-brand-dark text-sm">
            {count * tournament.players_per_team} / {tournament.max_players} joueurs inscrits
          </p>
          <p className="text-brand-text-secondary text-sm">
            👥 {tournament.players_per_team} joueur{tournament.players_per_team > 1 ? "s" : ""} par équipe
          </p>
        </div>

        {cancelled && (
          <div className="rounded-lg bg-amber-600/10 border border-amber-600/30 p-3 text-sm text-amber-600 text-center">
            Paiement annulé. Vous pouvez réessayer.
          </div>
        )}

        {tournament.registration_mode === "ONSITE" ? (
          <div className="rounded-xl bg-white border border-slate-200 p-8 text-center space-y-3">
            <p className="text-3xl">📍</p>
            <p className="font-semibold text-brand-dark">Inscriptions sur place uniquement</p>
            <p className="text-sm text-brand-text-secondary">
              Les inscriptions pour cet open se font directement le jour de l&apos;événement.
              Rendez-vous à l&apos;accueil le{" "}
              <strong className="text-brand-dark">
                {new Date(tournament.date).toLocaleDateString("fr-FR")}
              </strong>{" "}
              à <strong className="text-brand-dark">{tournament.location}</strong>.
            </p>
          </div>
        ) : isFull ? (
          <div className="rounded-xl bg-white border border-slate-200 p-8 text-center space-y-2">
            <p className="text-2xl">😔</p>
            <p className="font-semibold text-brand-dark">Tournoi complet</p>
            <p className="text-brand-text-secondary text-sm">Toutes les places sont prises.</p>
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-slate-200 p-6 space-y-5">
            <div>
              <h2 className="font-semibold text-brand-dark">Inscription de votre équipe</h2>
              {tournament.entry_fee > 0 && (
                <p className="text-brand-turquoise font-medium mt-1">
                  {(tournament.entry_fee / 100).toFixed(2)} € / joueur &nbsp;·&nbsp;{" "}
                  <span className="font-bold">
                    {((tournament.entry_fee * tournament.players_per_team) / 100).toFixed(2)} € / équipe
                  </span>
                </p>
              )}
            </div>
            <RegisterTeamForm tournamentId={id} isFree={tournament.entry_fee === 0} playersPerTeam={tournament.players_per_team} />
          </div>
        )}
      </div>
    </div>
  );
}
