import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api/client";
import { clearAuthCookies, getServerRefreshToken, getServerToken } from "@/lib/api/auth";

/**
 * Déconnexion locale à DartsOpen (révoque le refresh token courant + vide les cookies) —
 * appelée par components/LogoutButton.tsx avant le POST de formulaire top-level vers
 * SterPlatform /api/auth/sso/logout (déconnexion globale, voir LogoutButton.tsx).
 */
export async function POST() {
  let refreshToken = await getServerRefreshToken();
  let bearer = await getServerToken();

  // SterPlatform POST /api/auth/logout exige un JWT valide (IS_AUTHENTICATED_FULLY) même si
  // son propre traitement n'utilise que le refresh token fourni dans le corps. Si l'access
  // token a déjà expiré, on rafraîchit une fois — uniquement pour authentifier l'appel de
  // révocation, jamais pour prolonger la session qu'on est justement en train de fermer.
  if (refreshToken && !bearer) {
    try {
      const refreshRes = await apiFetch("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        bearer = data.token;
        refreshToken = data.refresh_token;
      }
    } catch (err) {
      console.warn("[logout] Rafraîchissement impossible avant révocation:", err);
    }
  }

  if (refreshToken && bearer) {
    try {
      const res = await apiFetch(
        "/api/auth/logout",
        { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) },
        bearer,
      );
      if (!res.ok) {
        console.warn("[logout] SterPlatform a refusé la révocation:", res.status);
      }
    } catch (err) {
      console.warn("[logout] Révocation SterPlatform échouée:", err);
    }
  }

  await clearAuthCookies();
  return NextResponse.json({ ok: true });
}
