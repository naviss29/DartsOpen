import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tableau de bord — DartsOpen" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, date, status, max_players")
    .eq("association_id", user!.id)
    .order("date", { ascending: false });

  const counts = {
    total: tournaments?.length ?? 0,
    draft: tournaments?.filter((t) => t.status === "DRAFT").length ?? 0,
    open: tournaments?.filter((t) => t.status === "OPEN").length ?? 0,
    inProgress: tournaments?.filter((t) => t.status === "IN_PROGRESS").length ?? 0,
    finished: tournaments?.filter((t) => t.status === "FINISHED").length ?? 0,
  };

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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: counts.total, color: "bg-gray-100 text-gray-700" },
          { label: "Ouvertes", value: counts.open, color: "bg-blue-50 text-blue-700" },
          { label: "En cours", value: counts.inProgress, color: "bg-green-50 text-green-700" },
          { label: "Terminés", value: counts.finished, color: "bg-gray-50 text-gray-600" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tournois récents */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournois récents</h2>
        {!tournaments?.length ? (
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
          <div className="space-y-3">
            {tournaments.slice(0, 5).map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-5 py-4 hover:border-green-300 hover:shadow-sm transition-all"
              >
                <div>
                  <p className="font-medium text-gray-900">{t.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {new Date(t.date).toLocaleDateString("fr-FR")} · {t.max_players} joueurs max
                  </p>
                </div>
                <StatusBadge status={t.status} />
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
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
