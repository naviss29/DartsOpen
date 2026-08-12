// SEC-006 — politique commune de headers HTTP de sécurité, appliquée par proxy.ts à chaque
// réponse. Aucun header de sécurité n'était posé ni par l'application ni par le reverse proxy
// (Coolify/Traefik) avant ce lot — vérifié par `curl -I` en production (voir rapport SEC-006).
//
// Construite à partir des intégrations réellement présentes dans ce dépôt : SterPlatform
// (SSO, paiement — form-action pour le POST de formulaire top-level vers
// /api/auth/sso/logout, voir LogoutButton.tsx), Mercure (temps réel bracket/live, EventSource
// côté navigateur — gouverné par connect-src, jamais frame-src), aucun Stripe direct (le
// paiement redirige entièrement vers une session Stripe hébergée créée par SterPlatform,
// jamais un iframe/SDK embarqué dans ce dépôt), aucun analytics, aucun iframe/embed.
//
// Le domaine Mercure est lu depuis NEXT_PUBLIC_MERCURE_PUBLIC_URL (même variable que
// lib/mercure.ts et les composants *Live.tsx) plutôt que codé en dur : si Mercure n'est pas
// configuré (variable absente), l'app retombe déjà sur du polling (voir CLAUDE.md §Mercure)
// et aucune entrée connect-src supplémentaire n'est nécessaire.

function originOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function buildSecurityHeaders(): Record<string, string> {
  const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
  const mercureOrigin = originOf(process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL);

  // dédoublonné : en production, le hub Mercure est parfois proxié sous le même domaine que
  // l'API SterPlatform (NEXT_PUBLIC_MERCURE_PUBLIC_URL et NEXT_PUBLIC_API_URL peuvent alors
  // partager la même origine) — un CSP valide mais inutilement répété sinon.
  const connectSrc = [...new Set(["'self'", apiOrigin, mercureOrigin].filter(Boolean))].join(" ");
  const formAction = ["'self'", apiOrigin].filter(Boolean).join(" ");

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' (script) : les scripts d'amorçage RSC de Next.js (App Router) sont
    // injectés en <script> inline (self.__next_f.push(...)) — pas de nonce dynamique posé
    // ici (mission SEC-006 §4 : ne pas remplacer par une architecture nonce complexe sans
    // nécessité démontrée). Aucun 'unsafe-eval' : non requis en build de production.
    "script-src 'self' 'unsafe-inline'",
    // 'unsafe-inline' (style) : attribut React style={{...}} (gouverné par style-src, pas
    // seulement les balises <style>) — aucun mécanisme nonce n'existe pour l'attribut style.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", // data: — QR codes d'inscription (package qrcode)
    "font-src 'self'", // next/font auto-héberge Inter, aucune requête externe au runtime
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "frame-ancestors 'none'", // aucun embed iframe identifié dans ce dépôt
    "object-src 'none'",
    "base-uri 'self'",
    // SterPlatform : POST de formulaire top-level vers /api/auth/sso/logout (LogoutButton.tsx)
    `form-action ${formAction}`,
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };

  // HSTS : absent du reverse proxy (vérifié par curl -I en production) ; les 5 applications
  // de ce lot sont garanties HTTPS (redirection Traefik confirmée). Pas de includeSubDomains
  // (sous-domaines de bapps-studio.com non tous audités dans ce lot), pas de preload.
  if (process.env.NODE_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }

  return headers;
}
