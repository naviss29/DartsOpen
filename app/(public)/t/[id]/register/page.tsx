import { getI18n } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { RegisterTeamForm } from "@/components/tournament/RegisterTeamForm";
import { dbGetTournamentPublic, dbCountOccupiedSlots } from "@/lib/db/tournament";
import type { Metadata } from "next";

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("register.meta") };
}

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  entry_fee: number;
  max_players: number;
  players_per_team: number;
  registration_mode: string;
  payment_mode: string;
  status: string;
  registered_count: number;
};

export default async function RegisterPage({ params, searchParams }: Props) {
  const { t, formatDate, formatNumber, formatCurrency } = await getI18n();
  const { id } = await params;
  const { cancelled } = await searchParams;

  const tournament = await dbGetTournamentPublic(id).catch(() => null) as Tournament | null;
  if (!tournament || tournament.status !== "OPEN") notFound();

  const count = await dbCountOccupiedSlots(id).catch(() => 0);
  const isFull = count * tournament.players_per_team >= tournament.max_players;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="DartsOpen" width={118} height={50} className="h-6 w-auto mx-auto" />
          <h1 className="text-2xl font-bold text-brand-dark">{tournament.name}</h1>
          <p className="text-brand-text-secondary text-sm">
            📅 {formatDate(tournament.date)} &nbsp;·&nbsp;
            📍 {tournament.location}
          </p>
          <p className="text-brand-dark text-sm">
            {t("register.count", { count: formatNumber(count * tournament.players_per_team), max: formatNumber(tournament.max_players) })}
          </p>
          <p className="text-brand-text-secondary text-sm">
            👥 {t(tournament.players_per_team > 1 ? "register.playersPerTeamPlural" : "register.playersPerTeam", { count: formatNumber(tournament.players_per_team) })}
          </p>
        </div>

        {cancelled && (
          <div className="rounded-lg border border-warning-solid/30 bg-warning-solid/10 p-3 text-sm text-warning text-center">
            {t("register.cancelled")}
          </div>
        )}

        {tournament.registration_mode === "ONSITE" ? (
          <div className="rounded-xl bg-surface border border-border-muted p-8 text-center space-y-3">
            <p className="text-3xl">📍</p>
            <p className="font-semibold text-brand-dark">{t("register.onsiteTitle")}</p>
            <p className="text-sm text-brand-text-secondary">
              {t("register.onsiteDetail", { date: formatDate(tournament.date), location: tournament.location })}
            </p>
          </div>
        ) : isFull ? (
          <div className="rounded-xl bg-surface border border-border-muted p-8 text-center space-y-2">
            <p className="text-2xl">😔</p>
            <p className="font-semibold text-brand-dark">{t("register.full")}</p>
            <p className="text-brand-text-secondary text-sm">{t("register.fullDetail")}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface border border-border-muted p-6 space-y-5">
            <div>
              <h2 className="text-h2 text-brand-dark">{t("register.heading")}</h2>
              {tournament.entry_fee > 0 && (
                <p className="text-brand-turquoise font-medium mt-1">
                  {t("register.perPlayer", { price: formatCurrency(tournament.entry_fee / 100) })} &nbsp;·&nbsp;{" "}
                  <span className="font-bold">
                    {t("register.perTeam", { price: formatCurrency((tournament.entry_fee * tournament.players_per_team) / 100) })}
                  </span>
                  {tournament.payment_mode !== "ONLINE" && (
                    <span className="block text-sm font-normal text-brand-text-secondary mt-0.5">
                      {t("register.paidOnsite")}
                    </span>
                  )}
                </p>
              )}
            </div>
            <RegisterTeamForm
              tournamentId={id}
              confirmsImmediately={tournament.entry_fee === 0 || tournament.payment_mode !== "ONLINE"}
              playersPerTeam={tournament.players_per_team}
            />
          </div>
        )}
      </div>
    </div>
  );
}
