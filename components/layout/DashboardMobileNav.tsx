"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dashboardNavLinks, navIcons } from "@/components/layout/DashboardSidebar";
import Button from "@/components/ui/Button";

/**
 * BAPPS-UX-UNIFICATION-006 LOT 2 — même structure que DashboardMobileNav de BSsite : remplace
 * l'ancienne bande blanche 64px (`bg-white`, `md:hidden`) empilée sous `AppHeader`, qui faisait
 * apparaître deux barres structurelles simultanées sous 768px — violation directe de la charte
 * graphique BApps Studio §4.1/§11.3 ("Une seule barre structurelle mobile de 64 px"), voir
 * BApps-Studio/02-Brand/BApps-Graphic-Charter.md.
 *
 * Ce composant ne rend plus de bande : uniquement le wordmark + le déclencheur (bouton
 * hamburger), tous deux `md:hidden`, destinés au slot `start` d'`AppHeader`
 * (`app/(dashboard)/layout.tsx`) — ordre imposé par la charte §10.1 ("ouverture du menu mobile
 * si nécessaire" en premier, identité ensuite). L'identité DartsOpen reste toujours visible sur
 * mobile (repris de l'ancienne bande) mais vit désormais DANS l'unique barre 64px d'AppHeader,
 * jamais dans une seconde barre — wordmark texte (comme `DashboardSidebar.tsx`), pas le logo SVG
 * de l'ancienne bande, qui suppose un fond clair : aucune variante inversée n'existe pour ce
 * produit, voir le docblock de `DashboardSidebar.tsx`. Et un panneau latéral (drawer), monté
 * uniquement à l'ouverture : largeur `min(320px, viewport − 48px)` (formule exacte de la charte
 * §4.1), fond `--color-sidenav-surface` (même ton que la sidebar desktop/AppHeader, jamais blanc
 * pour un élément de nav structurel) — le wordmark n'y est pas répété (déjà visible en
 * permanence dans le header).
 *
 * Fermeture : bouton dédié, `Escape`, ou clic sur le fond semi-transparent (`bg-overlay`,
 * `--color-overlay` = #020617 à 50%, charte §6.1 — réutilise le token déjà consommé par
 * `Dialog`/`ConfirmDialog` du design system, jamais une nouvelle couleur). Chaque lien referme
 * le panneau à la sélection (comportement déjà existant, conservé).
 */
export default function DashboardMobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="flex items-center gap-2 md:hidden">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-white">
          DartsOpen
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="px-2 text-white hover:bg-white/10"
          aria-expanded={open}
          aria-controls="dashboard-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 bg-white" />
            <span className="block h-0.5 w-5 bg-white" />
            <span className="block h-0.5 w-5 bg-white" />
          </span>
          <span className="sr-only">{open ? "Fermer le menu" : "Ouvrir le menu"}</span>
        </Button>
      </div>

      {open && (
        <div
          data-testid="dashboard-mobile-nav-backdrop"
          className="fixed inset-0 z-50 md:hidden"
          onMouseDown={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-overlay" aria-hidden="true" />
          <nav
            id="dashboard-mobile-menu"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(320px,calc(100vw-3rem))] flex-col overflow-y-auto"
            style={{ backgroundColor: "var(--color-sidenav-surface)" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-end p-4" style={{ backgroundColor: "var(--color-sidenav-header)" }}>
              <Button
                type="button"
                variant="ghost"
                className="px-2 text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
                <span className="sr-only">Fermer</span>
              </Button>
            </div>

            <div className="flex flex-col gap-1 px-3 py-4">
              {dashboardNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10"
                >
                  <span className="h-5 w-5 shrink-0" style={{ color: "var(--color-sidenav-icon)" }} aria-hidden="true">
                    {navIcons[link.icon]}
                  </span>
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
