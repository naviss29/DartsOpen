import { dbGetOrganization } from "@/lib/db/tournament";
import { getStripeConnectStatus } from "@/lib/api/sterplatformInternal";

/**
 * Garde-fou serveur unique pour le paiement en ligne DartsOpen (DO-PAYMENT-GUARD-001) : une
 * organisation ne peut activer le paiement en ligne d'un tournoi que si son compte Stripe
 * Connect est réellement opérationnel — jamais seulement "un compte existe". Source de
 * vérité unique : `getStripeConnectStatus()` (SterPlatform, `PaymentAuthorizationService`).
 * `canReceivePayments` reflète le statut calculé serveur (NO_ACCOUNT/ONBOARDING_INCOMPLETE/
 * ADDITIONAL_INFO_REQUIRED/RESTRICTED/CHARGES_DISABLED/PAYOUTS_DISABLED → false ;
 * OPERATIONAL → true) — jamais déduit de la simple présence d'un `stripeAccountId`.
 *
 * Ne concerne QUE l'activation du paiement en ligne (registration_mode ONLINE + entry_fee
 * positif). N'introduit aucune autre limitation (participants, tarifs, essai...) — hors
 * périmètre de cette mission, réservé à BAPPS-BUSINESS-001.
 */

export type OnlinePaymentAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "NO_ORGANIZATION" | "STRIPE_NOT_OPERATIONAL" };

/** Message utilisateur unique, réutilisé partout où ce refus doit s'afficher (cohérence). */
export const ONLINE_PAYMENT_BLOCKED_MESSAGE =
  "Le paiement en ligne nécessite un compte Stripe Connect opérationnel pour votre organisation. Configurez Stripe Connect dans BApps Studio, ou choisissez une inscription sans paiement en ligne.";

/**
 * `entry_fee` est déjà en centimes à ce stade (post-transformation Zod) — `> 0` signifie un
 * tournoi payant. Un tournoi ONLINE gratuit (entry_fee = 0) ne nécessite aucun Stripe :
 * aucun paiement n'est jamais initié dans ce cas (voir lib/actions/registration.ts).
 */
export function wantsOnlinePayment(data: { registration_mode: string; entry_fee: number }): boolean {
  return data.registration_mode === "ONLINE" && data.entry_fee > 0;
}

export type OnlinePaymentUiState = {
  canReceivePayments: boolean;
  organizationSlug: string | null;
};

/**
 * Lecture partagée par le contrôle serveur (`isOnlinePaymentAllowed`) et l'affichage (pages
 * de création/édition de tournoi) — un seul appel à SterPlatform, jamais deux implémentations
 * du même calcul. Relit toujours l'état courant, jamais mis en cache : un échec réseau vers
 * SterPlatform est traité comme "non opérationnel" (repli prudent), jamais comme une
 * autorisation implicite.
 */
export async function getOnlinePaymentUiState(userId: string): Promise<OnlinePaymentUiState> {
  const org = await dbGetOrganization(userId);
  if (!org?.sterOrganizationSlug) {
    return { canReceivePayments: false, organizationSlug: null };
  }

  const status = await getStripeConnectStatus(org.sterOrganizationSlug).catch(() => null);
  return { canReceivePayments: status?.canReceivePayments === true, organizationSlug: org.sterOrganizationSlug };
}

export async function isOnlinePaymentAllowed(userId: string): Promise<OnlinePaymentAuthorization> {
  const state = await getOnlinePaymentUiState(userId);
  if (!state.organizationSlug) {
    return { allowed: false, reason: "NO_ORGANIZATION" };
  }
  if (!state.canReceivePayments) {
    return { allowed: false, reason: "STRIPE_NOT_OPERATIONAL" };
  }
  return { allowed: true };
}
