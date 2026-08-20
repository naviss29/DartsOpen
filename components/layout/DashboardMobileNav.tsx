"use client";

import { useState } from "react";
import Link from "next/link";
import { dashboardNavLinks, navIcons } from "@/components/layout/DashboardSidebar";
import Button from "@/components/ui/Button";

/**
 * DO-BETA-UX-001 — remplace l'ancienne barre horizontale à scroll (`overflow-x-auto`), qui
 * faisait disparaître logo/identité utilisateur sur mobile sans aucun remplacement — exactement
 * l'anti-pattern nommé par BApps-Studio/04-Architecture/UX-UI-Standards.md §3 ("Navigation
 * mobile" : "jamais... des liens qui disparaissent sans remplacement"). Même structure que
 * DashboardMobileNav de BSsite : logo à gauche (identité, lien vers /dashboard), bouton
 * hamburger explicite à droite qui bascule un panneau déroulant listant les mêmes destinations
 * que la sidebar desktop — jamais une sidebar simplement rétrécie.
 */
export default function DashboardMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-200 bg-white md:hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <Link href="/dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG local de confiance, next/image bloque le SVG par défaut */}
          <img src="/brand/logo-horizontal.svg" alt="DartsOpen" width={166} height={70} className="h-7 w-auto" />
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="px-2"
          aria-expanded={open}
          aria-controls="dashboard-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 bg-brand-dark" />
            <span className="block h-0.5 w-5 bg-brand-dark" />
            <span className="block h-0.5 w-5 bg-brand-dark" />
          </span>
          <span className="sr-only">{open ? "Fermer le menu" : "Ouvrir le menu"}</span>
        </Button>
      </div>

      {open && (
        <nav id="dashboard-mobile-menu" className="flex flex-col gap-1 border-t border-slate-200 px-3 py-2">
          {dashboardNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-turquoise/10 hover:text-brand-turquoise"
            >
              <span className="h-5 w-5 shrink-0 text-brand-text-secondary" aria-hidden="true">{navIcons[link.icon]}</span>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
