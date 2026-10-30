/**
 * Chemin interne unique par lequel toute redirection "non connecté" doit passer — jamais un
 * lien direct vers le Portail (mission SSO écosystème) : /api/auth/sso/start ouvre la
 * transaction SSO locale (state, PKCE) avant de rediriger vers SterPlatform.
 */
export function ssoStartPath(next?: string): string {
  if (!next) return "/api/auth/sso/start";
  return `/api/auth/sso/start?next=${encodeURIComponent(next)}`;
}

const SAFE_DEFAULT_NEXT = "/dashboard";

// Tout caractère de contrôle ASCII (dont tabulation, CR, LF, NUL) et DEL.
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

/**
 * Pourquoi ces règles : l'ancienne garde (`startsWith("/")`, pas de `//`, pas de `://`) laissait
 * passer `/\evil.com` — or `new URL("/\\evil.com", appUrl)` (WHATWG URL) traite l'antislash comme
 * un `/` pour http/https et donne `https://evil.com/` : redirection ouverte après connexion. De
 * même, le parseur URL SUPPRIME tabulations et retours à la ligne : `/<TAB>/evil.com` devient
 * `//evil.com`. On refuse donc tout antislash et tout caractère de contrôle N'IMPORTE OÙ, ainsi
 * que les espaces en bordure (même logique que MarketPlace, CONNECT-MARKETPLACE-APPLICATION-005-FIX-001).
 */
function isUnsafeNextCandidate(candidate: string): boolean {
  if (candidate.trim() !== candidate) return true;
  if (CONTROL_CHARS_RE.test(candidate)) return true;
  if (!candidate.startsWith("/")) return true;
  if (candidate.startsWith("//")) return true;
  if (candidate.includes("\\")) return true;
  if (candidate.includes("://")) return true;
  return false;
}

/**
 * Un `next` n'est jamais suivi tel quel — seul un chemin interne, relatif, à un seul slash
 * initial est accepté (protection open-redirect). La valeur est vérifiée sous sa forme reçue ET
 * sous sa forme décodée une fois (`%5C` → antislash, `%09` → tabulation) : un futur appelant qui
 * transmettrait une valeur encore encodée reste protégé. Séquence `%` malformée → échec fermé.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return SAFE_DEFAULT_NEXT;
  if (isUnsafeNextCandidate(raw)) return SAFE_DEFAULT_NEXT;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return SAFE_DEFAULT_NEXT;
  }
  if (isUnsafeNextCandidate(decoded)) return SAFE_DEFAULT_NEXT;

  return raw;
}
