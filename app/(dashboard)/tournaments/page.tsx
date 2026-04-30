import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mes tournois — DartsOpen" };

export default async function TournamentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, date, location, status, max_players, nb_pools, nb_boards, entry_fee")
    .eq("association_id", user!.id)
    .or(`date.gte.${today},status.in.(IN_PROGRESS,FINISHED)`)
    .order("date", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes tournois</h1>
        <Link
          href="/tournaments/new"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
        >
          + Nouveau tournoi
        </Link>
      </div>

      {!tournaments?.length ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <p className="text-gray-500 mb-4">Aucun tournoi créé.</p>
          <Link
            href="/tournaments/new"
            className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Créer mon premier tournoi
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-green-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{t.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    📅 {new Date(t.date).toLocaleDateString("fr-FR")} &nbsp;·&nbsp;
                    📍 {t.location}
                  </p>
                  <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span>👤 {t.max_players} joueurs</span>
                    <span>🔵 {t.nb_pools} poules</span>
                    <span>🎯 {t.nb_boards} cibles</span>
                    <span>💶 {(t.entry_fee / 100).toFixed(2)} €</span>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
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
