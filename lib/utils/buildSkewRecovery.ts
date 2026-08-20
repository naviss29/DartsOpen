/**
 * DO-STABILIZATION-001 (Problème 3) — cause exacte : chaque déploiement (Dockerfile, stage
 * `builder`, `npm run build` exécuté par Coolify sur le VPS) produit un nouveau build Next.js,
 * donc de nouveaux identifiants de Server Actions, sans aucun mécanisme de coexistence (pas de
 * `generateBuildId`/`deploymentId` figé — inutile ici de toute façon : ces options stabilisent
 * plusieurs INSTANCES d'un MÊME build, jamais l'écart entre un ancien client et un nouveau
 * serveur après déploiement, voir le rapport de mission). Un onglet resté ouvert AVANT un
 * déploiement, avec l'ancien JavaScript encore en mémoire, invoque une Server Action par son
 * ancien identifiant : le nouveau serveur répond "Server Action "<hash>" was not found on the
 * server" — l'ancien identifiant n'existe simplement plus dans le nouveau build.
 *
 * Ce module ne "corrige" jamais l'écart lui-même (impossible sans changer la stratégie de
 * déploiement, hors périmètre ici) : il DÉTECTE ce cas précis et déclenche un rechargement sûr,
 * borné à une seule tentative (jamais de boucle) — un vrai bug applicatif qui ressemblerait
 * PAR TEXTE à ceci ne doit jamais être avalé indéfiniment.
 */

const SKEW_ERROR_PATTERNS: readonly RegExp[] = [
  /Server Action "[a-f0-9]+" was not found/i,
  /Failed to find Server Action/i,
  /ChunkLoadError/i,
  /Loading chunk [\w.-]+ failed/i,
];

/** Vrai uniquement pour le motif de message précis d'un build skew — jamais une erreur générique. */
export function isBuildSkewError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return false;
  return SKEW_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

const RECOVERY_GUARD_KEY = "do_build_skew_reload_attempted";

/**
 * Lecture pure (aucune écriture) — utilisable directement au rendu (ex. `useState(() =>
 * isBuildSkewError(error) && !hasAttemptedBuildSkewRecovery())`), contrairement à
 * attemptBuildSkewRecovery() ci-dessous qui déclenche un rechargement et ne doit donc jamais
 * s'exécuter ailleurs que dans un effect.
 */
export function hasAttemptedBuildSkewRecovery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(RECOVERY_GUARD_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Tente UNE fois un rechargement complet de la page (jamais `router.refresh()`, qui rejouerait
 * la même Server Action déjà introuvable) pour récupérer le build courant. Le garde-fou
 * `sessionStorage` (par onglet, jamais partagé entre onglets) empêche toute boucle : si l'erreur
 * persiste malgré un rechargement déjà tenté pour CET onglet, ce n'est plus un skew de
 * déploiement ordinaire (le nouveau build est déjà chargé) — on laisse alors l'appelant afficher
 * son état d'erreur normal plutôt que de reboucler indéfiniment.
 *
 * Retourne `true` si un rechargement a été déclenché (l'appelant doit alors éviter d'afficher
 * l'erreur technique brute, un rechargement est en cours), `false` sinon (l'appelant garde son
 * comportement habituel).
 */
export function attemptBuildSkewRecovery(error: unknown): boolean {
  if (!isBuildSkewError(error)) return false;
  if (typeof window === "undefined") return false;

  try {
    if (window.sessionStorage.getItem(RECOVERY_GUARD_KEY) === "1") {
      return false; // déjà tenté pour cet onglet — ne rejoue jamais une seconde fois
    }
    window.sessionStorage.setItem(RECOVERY_GUARD_KEY, "1");
  } catch {
    // sessionStorage indisponible (navigation privée stricte, quota) — pas de garde possible,
    // mieux vaut ne jamais recharger que risquer une boucle sans filet.
    return false;
  }

  console.warn("[buildSkewRecovery] Server Action introuvable après déploiement — rechargement de la page.", error);
  window.location.reload();
  return true;
}

/** Efface le garde-fou après un rechargement réussi qui n'a PAS reproduit l'erreur (nouvelle session applicative saine) — évite qu'un futur déploiement soit bloqué par une trace laissée par un précédent. */
export function clearBuildSkewRecoveryGuard(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RECOVERY_GUARD_KEY);
  } catch {
    // best-effort — rien à faire si sessionStorage est indisponible.
  }
}
