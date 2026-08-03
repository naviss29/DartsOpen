/**
 * Chemin interne unique par lequel toute redirection "non connecté" doit passer — jamais un
 * lien direct vers le Portail (mission SSO écosystème) : /api/auth/sso/start ouvre la
 * transaction SSO locale (state, PKCE) avant de rediriger vers SterPlatform.
 */
export function ssoStartPath(next?: string): string {
  if (!next) return "/api/auth/sso/start";
  return `/api/auth/sso/start?next=${encodeURIComponent(next)}`;
}

/**
 * Un `next` n'est jamais suivi tel quel — seul un chemin interne, relatif, à un seul slash
 * initial est accepté (protection open-redirect). `//evil.com` et `https://evil.com` sont tous
 * deux rejetés au profit d'une valeur par défaut sûre.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/dashboard";
  return raw;
}
