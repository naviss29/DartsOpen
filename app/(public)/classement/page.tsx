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
        <p className="text-gray-500 mt-2 text-sm">
          Tous tournois confondus · mis à jour après chaque tournoi terminé.
        </p>
      </div>

      {ranking.length === 0 ? (
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-12 text-center text-gray-500">
          Aucun tournoi terminé pour le moment.
        </div>
      ) : (
        <div className="space-y-2">
          {ranking.map((entry, i) => (
            <Link
              key={entry.player_name}
              href={`/p/${encodeURIComponent(entry.player_name)}`}
              className="flex items-center gap-4 rounded-xl bg-gray-900 border border-gray-800 px-5 py-4 hover:border-gray-600 transition-colors group"
            >
              <span
                className={`w-8 text-center font-black text-lg shrink-0 ${
                  i === 0
                    ? "text-yellow-400"
                    : i === 1
                    ? "text-gray-300"
                    : i === 2
                    ? "text-amber-600"
                    : "text-gray-600"
                }`}
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate group-hover:text-gray-100">
                  {entry.player_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
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
                <p className="text-2xl font-black text-white tabular-nums">{entry.points}</p>
                <p className="text-xs text-gray-600">pts</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-700 text-center pt-2">
        Participation +1 · Victoire poule +1 · Victoire bracket +2 · Champion +10
      </p>
    </div>
  );
}
