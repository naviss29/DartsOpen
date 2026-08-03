"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@naviss29/design-system";
import LogoutButton from "@/components/LogoutButton";

export const dashboardNavLinks = [
  { href: "/dashboard", label: "Tableau de bord", icon: "📊" },
  { href: "/tournaments", label: "Mes tournois", icon: "🏆" },
  { href: "/settings", label: "Paramètres", icon: "⚙️" },
];

/**
 * L'utilisateur ne savait jusqu'ici jamais où il se trouvait dans la navigation (aucun état
 * actif) — repliée sous `md:` (mobile first) — voir DashboardMobileNav.tsx pour l'équivalent
 * en dessous de ce seuil, même liste de liens, même logique d'état actif.
 */
export default function DashboardSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="border-b border-slate-200 p-6">
        <Link href="/dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="DartsOpen" width={166} height={70} className="h-9 w-auto" />
        </Link>
        <p className="mt-1 truncate text-xs text-brand-text-secondary">{userEmail}</p>
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
                current ? "bg-brand-turquoise/10 text-brand-turquoise" : "text-brand-dark hover:bg-slate-100",
              )}
            >
              <span aria-hidden="true">{link.icon}</span> {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-200 p-4">
        <Link
          href="/contact"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-text-secondary transition-colors hover:bg-slate-100"
        >
          <span aria-hidden="true">✉️</span> Contact
        </Link>
        <Link
          href="/dons"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-text-secondary transition-colors hover:bg-slate-100"
        >
          <span aria-hidden="true">💛</span> Soutenir le projet
        </Link>
        <LogoutButton />
        <p className="pt-3 text-center text-xs text-brand-text-secondary">
          DartsOpen · <span className="font-medium">by BApps Studio</span>
        </p>
      </div>
    </aside>
  );
}
