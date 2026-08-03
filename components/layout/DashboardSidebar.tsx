"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@naviss29/design-system";
import { logout } from "@/lib/actions/auth";

export const dashboardNavLinks = [
  { href: "/dashboard", label: "Tableau de bord", icon: "📊" },
  { href: "/tournaments", label: "Mes tournois", icon: "🏆" },
  { href: "/settings", label: "Paramètres", icon: "⚙️" },
];

/**
 * L'utilisateur ne savait jusqu'ici jamais où il se trouvait dans la navigation (aucun état
 * actif) — mission §5, "l'utilisateur doit toujours comprendre où il se trouve". Repliée sous
 * `md:` (mission §6, mobile first) — voir DashboardMobileNav.tsx pour l'équivalent en dessous
 * de ce seuil, même liste de liens, même logique d'état actif.
 */
export default function DashboardSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="border-b border-gray-200 p-6">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          🎯 DartsOpen
        </Link>
        <p className="mt-1 truncate text-xs text-gray-500">{userEmail}</p>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {dashboardNavLinks.map((link) => {
          const current = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                current ? "bg-darts-green/10 text-darts-green-dark" : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <span aria-hidden="true">{link.icon}</span> {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-gray-200 p-4">
        <Link
          href="/contact"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <span aria-hidden="true">✉️</span> Contact
        </Link>
        <Link
          href="/dons"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <span aria-hidden="true">💛</span> Soutenir le projet
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <span aria-hidden="true">🚪</span> Se déconnecter
          </button>
        </form>
        <div className="pt-3 text-center">
          <p className="mb-1 text-xs text-gray-400">Développé par</p>
          <Image
            src="/logoSEP.svg"
            alt="Stêr Eo Production"
            width={80}
            height={0}
            priority
            style={{ height: "auto" }}
            className="mx-auto w-20 opacity-60 transition-opacity hover:opacity-100"
          />
        </div>
      </div>
    </aside>
  );
}
