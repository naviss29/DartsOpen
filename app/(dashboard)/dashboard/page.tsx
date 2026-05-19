import { getUser } from "@/lib/api/auth";
import { dbListTournaments } from "@/lib/db/tournament";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tableau de bord — DartsOpen" };

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
  max_players: number;
  players_per_team: number;
  entry_fee: number;
  registration_mode: string;
  nb_pools: number;
  nb_boards: number;
  players_paid: number;
};

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const tournaments = await dbListTournaments(user.id).catch(() => []) as Tournament[];

  const stats = [
    { label: "Total", value: tournaments.length, color: "bg-gray-100 text-gray-700" },
    { label: "Ouvertes", value: tournaments.filter(t => t.status === "OPEN").length, color: "bg-blue-50 text-blue-700" },
    { label: "En cours", value: tournaments.filter(t => t.status === "IN_PROGRESS").length, color: "bg-green-50 text-green-700" },
    { label: "Terminés", value: tournaments.filter(t => t.status === "FINISHED").length, color: "bg-gray-50 text-gray-600" },
  ];

  const recent = tournaments.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <Link
          href="/tournaments/new"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + Nouveau tournoi
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Tournois récents</h2>
          {tournaments.length > 5 && (
            <Link href="/tournaments" className="text-sm text-green-600 hover:text-green-700">
              Voir tout →
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-500 mb-4">Aucun tournoi pour l&apos;instant.</p>
            <Link
              href="/tournaments/new"
              className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Créer mon premier tournoi
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {recent.map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      📅 {new Date(t.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp; 📍 {t.location}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>👤 {t.players_paid}/{t.max_players} joueurs</span>
                      <span>🔵 {t.nb_pools} poules</span>
                      <span>🎯 {t.nb_boards} cibles</span>
                      <span>💶 {(t.entry_fee / 100).toFixed(2)} €/j</span>
                      <span>{t.registration_mode === "ONLINE" ? "🌐 En ligne" : "🏠 Sur place"}</span>
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
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
    <span className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}
