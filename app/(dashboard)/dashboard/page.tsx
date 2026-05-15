import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tableau de bord — DartsOpen" };

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

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
        {[
          { label: "Total", value: 0, color: "bg-gray-100 text-gray-700" },
          { label: "Ouvertes", value: 0, color: "bg-blue-50 text-blue-700" },
          { label: "En cours", value: 0, color: "bg-green-50 text-green-700" },
          { label: "Terminés", value: 0, color: "bg-gray-50 text-gray-600" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournois récents</h2>
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500 mb-4">Aucun tournoi pour l&apos;instant.</p>
          <Link
            href="/tournaments/new"
            className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Créer mon premier tournoi
          </Link>
        </div>
      </div>
    </div>
  );
}
