"use client";

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
 */
export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/sso/logout`;
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-brand-text-secondary hover:bg-slate-100 transition-colors"
    >
      <span>🚪</span> Se déconnecter
    </button>
  );
}
