"use client";

import { Button } from "@naviss29/design-system";

/**
 * "Se déconnecter" coupe la session partout (migration écosystème SSO, même comportement que
 * BilletAsso/BSsite AUTH-006) — pas seulement sur DartsOpen. Usage réel : ordinateur partagé
 * (ex. bar/gymnase pendant un tournoi), où une déconnexion locale seule laissait la session
 * centrale active et reconnectait silencieusement la personne suivante.
 *
 * Un vrai POST navigateur (formulaire soumis, pas fetch()) vers
 * SterPlatform /api/auth/sso/logout — le cookie de session centrale (SameSite=Lax) doit
 * partir de façon fiable sur tous les navigateurs, ce qu'un fetch() cross-origine ne
 * garantit pas. SterPlatform répond par une redirection vers le portail (/login).
 *
 * BAPPS-SHELL-001 — `className` optionnelle : le `Button variant="text"` du Design System
 * suppose un fond clair (`text-text-secondary hover:text-accent`) ; sur le fond sombre de
 * l'AppHeader (`app/(dashboard)/layout.tsx`), l'appelant surcharge la couleur via cette prop
 * plutôt qu'une variante "on-dark" ajoutée au DS pour ce seul cas d'usage local.
 */
export default function LogoutButton({ className }: { className?: string } = {}) {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/sso/logout`;
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <Button type="button" variant="text" onClick={handleLogout} className={className}>
      Se déconnecter
    </Button>
  );
}
