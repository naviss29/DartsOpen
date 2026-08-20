"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BSSITE_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? "https://bapps-studio.com";

export const dashboardNavLinks = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard" },
  { href: "/tournaments", label: "Mes tournois", icon: "tournaments" },
  { href: "/settings", label: "Paramètres", icon: "settings" },
  { href: "/contact", label: "Contact", icon: "contact" },
];

/**
 * DO-BETA-UX-001 — mêmes icônes/style trait que BSsite (`viewBox 24, stroke 1.8`) : "dashboard"
 * et "contact" sont IDENTIQUES au tracé de BSsite (même grammaire visuelle, voir
 * BApps-Studio/04-Architecture/UX-UI-Standards.md §3bis "icônes devant chaque entrée de
 * navigation, généralisé"). "tournaments"/"settings" sont propres au menu DartsOpen (la
 * navigation reste celle du produit — mission §2) mais dessinées dans le même style.
 */
export const navIcons: Record<string, React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  tournaments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5.5a2 2 0 0 0 0 4H8" />
      <path d="M16 5h2.5a2 2 0 0 1 0 4H16" />
      <path d="M12 11v4" />
      <path d="M9 20h6" />
      <path d="M10.5 15h3l.5 5h-4l.5-5Z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  ),
  contact: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ),
};

/**
 * DO-BETA-UX-001 — shell aligné sur la grammaire commune BApps Studio (UX-UI-Standards.md
 * §3bis) : fond sombre `--color-sidenav-surface`/`--color-sidenav-header` (mêmes valeurs
 * littérales que BSsite/EventManager), icônes teintées `--color-sidenav-icon`, état actif =
 * fond turquoise translucide + barre verticale d'accent à gauche (jamais un simple fond
 * blanc/gris translucide neutre). Repliée sous `md:` — voir DashboardMobileNav.tsx pour
 * l'équivalent mobile (menu hamburger, pas une barre qui fait disparaître logo/nav).
 *
 * BAPPS-SHELL-001 — le logo DartsOpen (dégradé + texte marine `rgb(12,18,67)`) resterait
 * illisible posé directement sur le fond sombre du shell : aucune variante "light"/inversée
 * officielle n'existe pour ce produit (contrairement à `Logo`/`light` de BSsite) — plutôt que
 * de recréer un fond blanc local (l'exact défaut que cette mission corrige) ou une variante SVG
 * approximative, le shell affiche un wordmark texte (règle actée dans BApps-Studio/
 * 04-Architecture/UX-UI-Standards.md §3ter). Le logo original reste utilisé tel quel partout où
 * il est posé sur un fond compatible (ex. pages publiques).
 */
export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col md:flex" style={{ backgroundColor: "var(--color-sidenav-surface)" }}>
      <div className="p-6" style={{ backgroundColor: "var(--color-sidenav-header)" }}>
        <Link href="/dashboard" className="text-xl font-bold tracking-tight text-white">
          DartsOpen
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {dashboardNavLinks.map((link) => {
          const current = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white transition-colors ${
                current ? "font-semibold" : "font-medium hover:bg-white/10"
              }`}
              style={current ? { backgroundColor: "rgba(7, 128, 153, 0.35)" } : undefined}
            >
              {current && <span aria-hidden="true" className="absolute inset-y-1 left-0 w-1 rounded-r bg-brand-turquoise" />}
              <span className="h-5 w-5 shrink-0" style={{ color: "var(--color-sidenav-icon)" }}>
                {navIcons[link.icon]}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <a
          href={BSSITE_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 text-center text-xs text-white/70 transition-colors hover:text-white"
        >
          DartsOpen · <span className="font-medium">by BApps Studio</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
        </a>
      </div>
    </aside>
  );
}
