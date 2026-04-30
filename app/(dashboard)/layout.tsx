import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: association } = await supabase
    .from("associations")
    .select("name")
    .eq("id", user?.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link href="/dashboard" className="text-xl font-bold text-gray-900">
            🎯 DartsOpen
          </Link>
          <p className="mt-1 text-xs text-gray-500 truncate">{association?.name ?? "Association"}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span>📊</span> Tableau de bord
          </Link>
          <Link
            href="/tournaments"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span>🏆</span> Mes tournois
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span>⚙️</span> Paramètres
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-1">
          <Link
            href="/contact"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span>✉️</span> Contact
          </Link>
          <Link
            href="/dons"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span>💛</span> Soutenir le projet
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <span>🚪</span> Se déconnecter
            </button>
          </form>
          <div className="pt-3 text-center">
            <p className="text-xs text-gray-400">Développé par</p>
            <p className="text-xs font-semibold text-gray-500">Stêr Eo Production</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
