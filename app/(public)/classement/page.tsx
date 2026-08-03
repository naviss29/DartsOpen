import { dbGetRanking } from "@/lib/db/ranking";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Classement général — DartsOpen",
  description: "Classement inter-tournois des joueurs de fléchettes.",
};

export default async function ClassementPage() {
  const ranking = await dbGetRanking();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-black">🏆 Classement général</h1>
        <p className="text-darts-text-secondary mt-2 text-sm">
          Tous tournois confondus · mis à jour après chaque tournoi terminé.
        </p>
      </div>

      {ranking.length === 0 ? (
        <div className="rounded-2xl bg-darts-surface border border-darts-border p-12 text-center text-darts-text-secondary">
          Aucun tournoi terminé pour le moment.
        </div>
      ) : (
        <div className="space-y-2">
          {ranking.map((entry, i) => (
            <Link
              key={entry.player_name}
              href={`/p/${encodeURIComponent(entry.player_name)}`}
              className="flex items-center gap-4 rounded-xl bg-darts-surface border border-darts-border px-5 py-4 hover:border-darts-text-secondary transition-colors group"
            >
              <span
                className={`w-8 text-center font-black text-lg shrink-0 ${
                  i === 0
                    ? "text-darts-gold"
                    : i === 1
                    ? "text-darts-text"
                    : i === 2
                    ? "text-darts-gold-dark"
                    : "text-darts-text-secondary"
                }`}
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-darts-text truncate group-hover:text-darts-text">
                  {entry.player_name}
                </p>
                <p className="text-xs text-darts-text-secondary mt-0.5">
                  {entry.tournaments} tournoi{entry.tournaments > 1 ? "s" : ""} ·{" "}
                  {entry.wins} victoire{entry.wins > 1 ? "s" : ""}
                </p>
              </div>

              {entry.championships > 0 && (
                <span className="text-lg" title={`${entry.championships} titre${entry.championships > 1 ? "s" : ""}`}>
                  👑
                </span>
              )}

              <div className="text-right shrink-0">
                <p className="font-score text-2xl font-black text-darts-text tabular-nums">{entry.points}</p>
                <p className="text-xs text-darts-text-secondary">pts</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-darts-text-secondary text-center pt-2">
        Participation +1 · Victoire poule +1 · Victoire bracket +2 · Champion +10
      </p>
    </div>
  );
}
