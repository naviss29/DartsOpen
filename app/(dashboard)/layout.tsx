import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import DashboardSidebar from "@/components/layout/DashboardSidebar";
import DashboardMobileNav from "@/components/layout/DashboardMobileNav";
import LogoutButton from "@/components/LogoutButton";

/**
 * DO-OPS-001 — `LandscapeGuard` (overlay bloquant "Tournez votre téléphone") enveloppait
 * auparavant TOUT le dashboard depuis ce layout : n'importe quelle page organisateur, y compris
 * la nouvelle console jour J (mobile-first, priorité absolue de cette mission), affichait cet
 * écran bloquant à un organisateur en portrait sur téléphone — exactement le défaut identifié
 * par l'audit stratégique ("back-office bloquant ou mal adapté au portrait"). Seule la vue
 * bracket (arbre large, effectivement optimisée pour le paysage) garde ce garde-fou, appliqué
 * localement dans `bracket/page.tsx` — jamais plus au niveau du layout global.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-brand-light">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* DO-BETA-UX-001 — même langage que BSsite (UX-UI-Standards.md §3 "Header") :
            identité utilisateur + déconnexion à droite d'un bandeau clair toujours visible
            (desktop ET mobile), distinct de la sidebar sombre. */}
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <span className="hidden truncate text-sm text-brand-text-secondary sm:block">{user.email}</span>
          <LogoutButton />
        </header>
        <DashboardMobileNav />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
