import { dbGetOrganization } from "@/lib/db/tournament";
import { hasOptionalSubscriptionAccess } from "@/lib/api/organizations";
import { consumeTournamentCredit, getTournamentCreditsAvailable } from "@/lib/api/tournamentCredits";
import { FREE_TIER_MAX_PLAYERS } from "./constants";

export { FREE_TIER_MAX_PLAYERS };

export const TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ORGANIZATION =
  "Un tournoi de plus de 10 joueurs nécessite un accès payant. Liez d'abord votre compte à une organisation BApps Studio dans les Paramètres, puis achetez un crédit tournoi (4,90€) ou souscrivez un abonnement DartsOpen (6,90€/mois ou 69€/an).";

export const TOURNAMENT_SIZE_BLOCKED_MESSAGE_NO_ENTITLEMENT =
  "Ce tournoi dépasse la limite de 10 joueurs de l'accès gratuit. Achetez un crédit tournoi (4,90€, valable pour ce tournoi) ou souscrivez un abonnement DartsOpen (6,90€/mois ou 69€/an) depuis BApps Studio pour continuer.";

/**
 * True uniquement quand `newMaxPlayers` dépasse à la fois le palier gratuit ET ce que le
 * tournoi avait déjà — jamais re-vérifié pour une valeur inchangée ou réduite (mission §12/§15 :
 * ne casse jamais un tournoi >10 déjà créé avant cette règle). `currentMaxPlayers` vaut 0 à la
 * création (aucune valeur préexistante).
 */
export function requiresEntitlementCheck(newMaxPlayers: number, currentMaxPlayers: number): boolean {
  return newMaxPlayers > FREE_TIER_MAX_PLAYERS && newMaxPlayers > currentMaxPlayers;
}

export type TournamentSizeResolution =
  | { mode: "SUBSCRIPTION" }
  | { mode: "CREDIT_ATTEMPT"; organizationSlug: string }
  | { mode: "NONE"; reason: "NO_ORGANIZATION" };

/**
 * DARTSOPEN-MONETIZATION-002 — pure read, never mutates anything: resolves which entitlement
 * path applies, WITHOUT consuming a credit. Split out from the old, single
 * `authorizeTournamentSize()` (DARTSOPEN-MONETIZATION-001) specifically so callers can create
 * the local tournament row *before* ever touching SterPlatform's credit ledger (audit
 * DO-AUD-001: "le crédit ne doit devenir définitivement consommé que lorsque le tournoi existe
 * réellement" — see lib/actions/tournament.ts).
 *
 * Réutilise Organization.sterOrganizationSlug (DO-003, lien unique existant vers une
 * organisation SterPlatform, jusqu'ici réservé au seul Stripe Connect) comme unique ancrage
 * pour la monétisation aussi.
 */
export async function resolveTournamentSizeEntitlement(userId: string): Promise<TournamentSizeResolution> {
  const org = await dbGetOrganization(userId);
  if (!org?.sterOrganizationSlug) {
    return { mode: "NONE", reason: "NO_ORGANIZATION" };
  }

  const hasSubscriptionAccess = await hasOptionalSubscriptionAccess(org.sterOrganizationSlug, "DARTSOPEN");
  if (hasSubscriptionAccess) {
    return { mode: "SUBSCRIPTION" };
  }

  return { mode: "CREDIT_ATTEMPT", organizationSlug: org.sterOrganizationSlug };
}

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002) — the only mutating step: permanently
 * consumes one tournament credit, idempotent on `reference`. `reference` must be a value that
 * stays IDENTICAL across retries of the same user gesture (the tournament's own
 * `idempotencyKey` — never a value regenerated per request, which is exactly what made
 * DARTSOPEN-MONETIZATION-001's version of this consumable more than once per gesture on a
 * double-click/retry).
 */
export async function consumeTournamentSizeCredit(organizationSlug: string, reference: string): Promise<boolean> {
  const result = await consumeTournamentCredit(organizationSlug, reference);
  return result.ok;
}

export type TournamentSizeUiState = {
  hasActiveSubscription: boolean;
  availableCredits: number;
  organizationSlug: string | null;
};

/**
 * Lecture pour l'affichage uniquement (mission §10) — jamais utilisée pour la décision
 * d'autorisation elle-même (voir resolveTournamentSizeEntitlement()/consumeTournamentSizeCredit()).
 */
export async function getTournamentSizeUiState(userId: string): Promise<TournamentSizeUiState> {
  const org = await dbGetOrganization(userId);
  if (!org?.sterOrganizationSlug) {
    return { hasActiveSubscription: false, availableCredits: 0, organizationSlug: null };
  }

  const [hasActiveSubscription, availableCredits] = await Promise.all([
    hasOptionalSubscriptionAccess(org.sterOrganizationSlug, "DARTSOPEN"),
    getTournamentCreditsAvailable(org.sterOrganizationSlug),
  ]);

  return { hasActiveSubscription, availableCredits, organizationSlug: org.sterOrganizationSlug };
}
