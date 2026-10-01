import { getPaymentAuthorization } from "@/lib/api/organizations";
import { resolveBillingOrganizationSlug, type BillingOrganizationSource } from "@/lib/organizations/billingOrganization";

/**
 * Garde-fou serveur unique pour le paiement en ligne DartsOpen (DO-PAYMENT-GUARD-001) : une
 * organisation ne peut activer le paiement en ligne d'un tournoi que si son compte Stripe
 * Connect est réellement opérationnel — jamais seulement "un compte existe". Source de
 * vérité unique : `getPaymentAuthorization()` (SterPlatform, `PaymentAuthorizationService`,
 * même endpoint JWT que la page Stripe de BSsite — voir son docblock,
 * DARTSOPEN-MONETIZATION-001). `canReceivePayments` reflète le statut calculé serveur
 * (NO_ACCOUNT/ONBOARDING_INCOMPLETE/ADDITIONAL_INFO_REQUIRED/RESTRICTED/CHARGES_DISABLED/
 * PAYOUTS_DISABLED → false ; OPERATIONAL → true) — jamais déduit de la simple présence d'un
 * `stripeAccountId`.
 *
 * Ne concerne QUE l'activation du paiement en ligne (payment_mode ONLINE + entry_fee positif —
 * indépendant de registration_mode, voir wantsOnlinePayment() ci-dessous,
 * DARTSOPEN-MONETIZATION-001). N'introduit aucune autre limitation (participants, tarifs,
 * essai...) — hors périmètre de cette mission, réservé à BAPPS-BUSINESS-001.
 */

export type OnlinePaymentAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "NO_ORGANIZATION" | "STRIPE_NOT_OPERATIONAL" };

/** Message utilisateur unique, réutilisé partout où ce refus doit s'afficher (cohérence). */
export const ONLINE_PAYMENT_BLOCKED_MESSAGE =
  "Le paiement en ligne nécessite un compte Stripe Connect opérationnel pour votre organisation. Configurez Stripe Connect dans BApps Studio, ou choisissez une inscription sans paiement en ligne.";

/**
 * `entry_fee` est déjà en centimes à ce stade (post-transformation Zod) — `> 0` signifie un
 * tournoi payant. Un tournoi gratuit (entry_fee = 0) ne nécessite aucun Stripe : aucun paiement
 * n'est jamais initié dans ce cas (voir lib/actions/registration.ts). `payment_mode` est
 * indépendant de `registration_mode` (mission §5/§6, DARTSOPEN-MONETIZATION-001) : un tournoi
 * peut être ouvert aux inscriptions en ligne tout en faisant payer sur place — seul
 * payment_mode = "ONLINE" déclenche jamais un Stripe Connect requis ou un checkout en ligne.
 */
export function wantsOnlinePayment(data: { payment_mode: string; entry_fee: number }): boolean {
  return data.payment_mode === "ONLINE" && data.entry_fee > 0;
}

/**
 * DARTSOPEN-MONETIZATION-002 (audit priorité 4) — trois états distincts, jamais deux :
 * OPERATIONAL et NOT_OPERATIONAL sont deux déterminations réelles faites par SterPlatform ;
 * INDETERMINATE signifie que SterPlatform n'a pas pu être consulté (réseau, jeton, timeout —
 * voir getPaymentAuthorization(), qui journalise systématiquement la cause réelle) et ne doit
 * JAMAIS être assimilé silencieusement à "pas de Stripe Connect" — c'est précisément la
 * confusion à l'origine du message erroné constaté en production pour une organisation dont
 * Stripe Connect était en réalité opérationnel.
 */
export type StripeConnectStatus = "OPERATIONAL" | "NOT_OPERATIONAL" | "INDETERMINATE";

export type OnlinePaymentUiState = {
  status: StripeConnectStatus;
  canReceivePayments: boolean;
  organizationSlug: string | null;
};

/**
 * Lecture partagée par le contrôle serveur (`isOnlinePaymentAllowed`) et l'affichage (pages
 * de création/édition de tournoi) — un seul appel à SterPlatform, jamais deux implémentations
 * du même calcul. Relit toujours l'état courant, jamais mis en cache : un échec réseau vers
 * SterPlatform est traité comme non autorisant le paiement en ligne (repli prudent, jamais une
 * autorisation implicite) — mais reporté comme INDETERMINATE, jamais NOT_OPERATIONAL, pour ne
 * jamais laisser croire que Stripe Connect doit être (re)configuré alors qu'on ignore
 * simplement son état réel (DARTSOPEN-MONETIZATION-002). Toujours journalisé par
 * getPaymentAuthorization() elle-même, jamais silencieusement avalé.
 *
 * Utilise le JWT de la requête courante (via getPaymentAuthorization(), pas le jeton
 * serveur-à-serveur) : tous les appelants s'exécutent pour un utilisateur authentifié
 * (getUser() à la création, requireTournamentManager() à la modification).
 *
 * ADR-0021 / L7 — l'organisation interrogée est celle du TOURNOI (ou l'organisation courante à
 * la création), plus la liaison locale du créateur : `source` vient de
 * `billingSourceForTournament()` / `billingSourceForCreation()`. Le JWT de la requête est donc
 * celui d'un membre de l'organisation interrogée (OWNER/ADMIN pour une décision), ce qui corrige
 * BUG-4 (Stripe Connect opérationnel dans BSsite mais « configurer Stripe Connect » ici). Le
 * repli créateur ne subsiste que pour un tournoi sans organisation. `source = null` : aucune
 * organisation exploitable (ex. création refusée faute d'organisation choisie) ⇒ affiché comme
 * une absence, jamais comme une autorisation.
 */
export async function getOnlinePaymentUiState(source: BillingOrganizationSource | null): Promise<OnlinePaymentUiState> {
  const slug = source ? await resolveBillingOrganizationSlug(source, { authenticated: true }) : null;
  if (!slug) {
    // Aucune organisation exploitable : une absence réelle et actionnable, jamais un état
    // indéterminé — pas la peine de réessayer.
    return { status: "NOT_OPERATIONAL", canReceivePayments: false, organizationSlug: null };
  }

  const authorization = await getPaymentAuthorization(slug);
  if (authorization === null) {
    return { status: "INDETERMINATE", canReceivePayments: false, organizationSlug: slug };
  }

  return {
    status: authorization.canReceivePayments ? "OPERATIONAL" : "NOT_OPERATIONAL",
    canReceivePayments: authorization.canReceivePayments === true,
    organizationSlug: slug,
  };
}

export async function isOnlinePaymentAllowed(source: BillingOrganizationSource | null): Promise<OnlinePaymentAuthorization> {
  const state = await getOnlinePaymentUiState(source);
  if (!state.organizationSlug) {
    return { allowed: false, reason: "NO_ORGANIZATION" };
  }
  // NOT_OPERATIONAL et INDETERMINATE refusent tous les deux l'écriture (repli prudent) — seule
  // la page d'affichage distingue les deux messages, jamais la décision d'autorisation
  // elle-même.
  if (!state.canReceivePayments) {
    return { allowed: false, reason: "STRIPE_NOT_OPERATIONAL" };
  }
  return { allowed: true };
}
