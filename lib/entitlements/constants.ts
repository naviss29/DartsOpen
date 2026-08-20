/**
 * DARTSOPEN-MONETIZATION-001 — extrait de tournamentSizeGuard.ts pour rester importable depuis
 * un composant client (TournamentForm/EditTournamentForm) sans jamais tirer dedans le reste du
 * module serveur (dbGetOrganization → Prisma/pg, incompatible navigateur).
 */
export const FREE_TIER_MAX_PLAYERS = 10;

/**
 * DO-STABILIZATION-001 — plafond quand un entitlement (abonnement actif ou crédit tournoi
 * disponible) est confirmé. Même valeur que `max_players.max(512)` dans le schéma Zod
 * (lib/actions/tournament.ts) — seule source de vérité serveur ; ce plafond côté client n'est
 * jamais qu'un confort d'affichage (voir hasConfirmedTournamentSizeEntitlement ci-dessous).
 */
export const PAID_TIER_MAX_PLAYERS = 512;

/**
 * DO-STABILIZATION-001 (Problème 1) — seule condition qui autorise réellement de dépasser 10
 * joueurs côté UI : un abonnement actif OU au moins un crédit tournoi disponible.
 * `PENDING_ENTITLEMENT`/une résolution indéterminée n'apparaissent jamais ici — cette fonction
 * ne lit que l'état d'affichage déjà calculé (`getTournamentSizeUiState`, jamais utilisé pour la
 * décision serveur elle-même, voir tournamentSizeGuard.ts) : un entitlement encore incertain
 * remonte `hasActiveSubscription: false, availableCredits: 0`, donc `false` ici — jamais un
 * plafond élevé sur la seule foi d'un état indéterminé.
 */
export function hasConfirmedTournamentSizeEntitlement(hasActiveSubscription: boolean, availableCredits: number): boolean {
  return hasActiveSubscription || availableCredits > 0;
}
