import { dbGetOrganization } from "@/lib/db/tournament";
import { getMyOrganizations } from "@/lib/api/organizations";
import { consumeTournamentCredit, getTournamentCreditsAvailable } from "@/lib/api/tournamentCredits";
import { FREE_TIER_MAX_PLAYERS } from "./constants";

export { FREE_TIER_MAX_PLAYERS };

export const TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION =
  "Un tournoi de plus de 10 joueurs nécessite un accès payant. Liez d'abord votre compte à une organisation BApps Studio dans les Paramètres, puis achetez un crédit tournoi (4,90€) ou souscrivez un abonnement DartsOpen (6,90€/mois ou 69€/an).";

export const TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT =
  "Ce tournoi dépasse la limite de 10 joueurs de l'accès gratuit. Achetez un crédit tournoi (4,90€, valable pour ce tournoi) ou souscrivez un abonnement DartsOpen (6,90€/mois ou 69€/an) depuis BApps Studio pour continuer.";

export type TournamentSizeAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "NO_ORGANIZATION" | "NO_ENTITLEMENT" };

/**
 * True uniquement quand `newMaxPlayers` dépasse à la fois le palier gratuit ET ce que le
 * tournoi avait déjà — jamais re-vérifié pour une valeur inchangée ou réduite (mission §12/§15 :
 * ne casse jamais un tournoi >10 déjà créé avant cette règle). `currentMaxPlayers` vaut 0 à la
 * création (aucune valeur préexistante).
 */
export function requiresEntitlementCheck(newMaxPlayers: number, currentMaxPlayers: number): boolean {
  return newMaxPlayers > FREE_TIER_MAX_PLAYERS && newMaxPlayers > currentMaxPlayers;
}

/**
 * Contrôle serveur unique de la règle des 10 joueurs (mission §2/§9/§11) — jamais fait
 * confiance à une valeur transmise par le frontend. Ne doit être appelé QUE quand
 * requiresEntitlementCheck() est vrai, avant toute écriture.
 *
 * Source de vérité des droits, par ordre de priorité :
 *  1. Abonnement DARTSOPEN actif (ACTIVE/TRIALING, GET /api/me/organizations) pour
 *     l'organisation SterPlatform liée — ne consomme jamais de crédit tant qu'un abonnement
 *     actif suffit déjà.
 *  2. Sinon, consommation définitive d'un crédit tournoi (idempotent sur `tournamentReference`
 *     = l'id du tournoi DartsOpen concerné — voir lib/api/tournamentCredits.ts).
 *
 * Réutilise Organization.sterOrganizationSlug (DO-003, lien unique existant vers une
 * organisation SterPlatform, jusqu'ici réservé au seul Stripe Connect) comme unique ancrage
 * pour la monétisation aussi : un utilisateur DartsOpen sans organisation liée n'a par
 * construction aucun abonnement/crédit à vérifier, ce qui est cohérent puisque lier une
 * organisation est aussi le préalable pour en acheter un.
 */
export async function authorizeTournamentSize(userId: string, tournamentReference: string): Promise<TournamentSizeAuthorization> {
  const org = await dbGetOrganization(userId);
  if (!org?.sterOrganizationSlug) {
    return { allowed: false, reason: "NO_ORGANIZATION" };
  }

  const organizations = await getMyOrganizations();
  const linked = organizations?.find((o) => o.slug === org.sterOrganizationSlug);
  const hasActiveSubscription = linked?.subscriptions.some(
    (s) => s.product === "DARTSOPEN" && (s.status === "ACTIVE" || s.status === "TRIALING"),
  ) ?? false;

  if (hasActiveSubscription) {
    return { allowed: true };
  }

  const result = await consumeTournamentCredit(org.sterOrganizationSlug, tournamentReference);
  if (!result.ok) {
    return { allowed: false, reason: "NO_ENTITLEMENT" };
  }

  return { allowed: true };
}

export type TournamentSizeUiState = {
  hasActiveSubscription: boolean;
  availableCredits: number;
  organizationSlug: string | null;
};

/**
 * Lecture pour l'affichage uniquement (mission §10) — jamais utilisée pour la décision
 * d'autorisation elle-même (voir authorizeTournamentSize(), qui consomme directement plutôt que
 * de lire ce résumé puis décider séparément).
 */
export async function getTournamentSizeUiState(userId: string): Promise<TournamentSizeUiState> {
  const org = await dbGetOrganization(userId);
  if (!org?.sterOrganizationSlug) {
    return { hasActiveSubscription: false, availableCredits: 0, organizationSlug: null };
  }

  const [organizations, availableCredits] = await Promise.all([
    getMyOrganizations(),
    getTournamentCreditsAvailable(org.sterOrganizationSlug),
  ]);

  const linked = organizations?.find((o) => o.slug === org.sterOrganizationSlug);
  const hasActiveSubscription = linked?.subscriptions.some(
    (s) => s.product === "DARTSOPEN" && (s.status === "ACTIVE" || s.status === "TRIALING"),
  ) ?? false;

  return { hasActiveSubscription, availableCredits, organizationSlug: org.sterOrganizationSlug };
}
