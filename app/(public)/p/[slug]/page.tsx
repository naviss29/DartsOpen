import { dbGetPlayerProfile } from "@/lib/db/ranking";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = decodeURIComponent(slug);
  return {
    title: `${name} — DartsOpen`,
    description: `Profil et statistiques de ${name} sur DartsOpen.`,
  };
}

const RESULT_LABELS = {
  champion: { label: "Champion", color: "text-amber-600", icon: "👑" },
  bracket: { label: "Bracket", color: "text-blue-600", icon: "🎯" },
  poules: { label: "Poules", color: "text-brand-text-secondary", icon: "" },
} as const;

export default async function PlayerProfilePage({ params }: Props) {
  const { slug } = await params;
  const playerName = decodeURIComponent(slug);

  const profile = await dbGetPlayerProfile(playerName);
  if (!profile) notFound();

  const { stats, history } = profile;

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
      {/* Nav */}
      <Link href="/classement" className="text-xs text-brand-text-secondary hover:text-brand-dark transition-colors">
        ← Classement
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl font-black text-brand-dark shrink-0">
          {profile.player_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-brand-dark truncate">{profile.player_name}</h1>
          <p className="text-brand-text-secondary text-sm">
            {stats.tournaments} tournoi{stats.tournaments > 1 ? "s" : ""}
          </p>
        </div>
        {stats.championships > 0 && (
          <span
            className="ml-auto text-3xl shrink-0"
            title={`${stats.championships} titre${stats.championships > 1 ? "s" : ""}`}
          >
            👑
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Points", value: profile.points, accent: true },
          { label: "Victoires", value: stats.wins, accent: false },
          { label: "Titres", value: stats.championships, accent: false },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="rounded-xl bg-white border border-slate-200 p-4 text-center"
          >
            <p className={`tabular-score text-3xl font-black ${accent ? "text-brand-dark" : "text-brand-text-secondary"}`}>
              {value}
            </p>
            <p className="text-xs text-brand-text-secondary mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Détail wins */}
      {stats.wins > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 px-5 py-4 flex gap-6">
          <div className="text-center">
            <p className="text-xl font-bold text-brand-dark">{stats.pool_wins}</p>
            <p className="text-xs text-brand-text-secondary mt-0.5">poule</p>
          </div>
          <div className="w-px bg-slate-200" />
          <div className="text-center">
            <p className="text-xl font-bold text-brand-dark">{stats.bracket_wins}</p>
            <p className="text-xs text-brand-text-secondary mt-0.5">bracket</p>
          </div>
        </div>
      )}

      {/* Historique */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-text-secondary">
            Historique
          </h2>
          {history.map((t) => {
            const { label, color, icon } = RESULT_LABELS[t.result];
            return (
              <div
                key={t.tournament_id}
                className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-dark truncate">{t.tournament_name}</p>
                  <p className="text-xs text-brand-text-secondary mt-0.5">
                    {t.tournament_date} · {t.wins} victoire{t.wins !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className={`text-sm font-semibold shrink-0 ${color}`}>
                  {icon && <span className="mr-1">{icon}</span>}
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
