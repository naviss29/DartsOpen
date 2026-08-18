/**
 * Client server-to-server vers l'API interne de SterPlatform (`/api/internal/**`, mission
 * DO-003) — authentifié par `X-App-Token` (même mécanisme et même jeton que
 * lib/api/sterplatform.ts::sendEmail, `ServerTokenAuthenticator` côté SterPlatform accepte
 * un seul jeton par module quel que soit l'endpoint appelé). Remplace toute logique Stripe
 * locale : DartsOpen ne dialogue plus jamais directement avec Stripe, uniquement avec
 * SterPlatform, qui gère Stripe Connect pour le compte de l'organisation.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const API_TOKEN = process.env.STER_API_TOKEN!;

async function internalFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': API_TOKEN,
      ...(options.headers as Record<string, string>),
    },
  });
}

export type PaymentAuthorizationStatus =
  | 'NO_ACCOUNT'
  | 'ONBOARDING_INCOMPLETE'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'RESTRICTED'
  | 'CHARGES_DISABLED'
  | 'PAYOUTS_DISABLED'
  | 'OPERATIONAL';

export type StripeConnectStatus = {
  stripeAccountId: string;
  status: PaymentAuthorizationStatus;
  canReceivePayments: boolean;
  reason: string | null;
};

/**
 * `GET /api/internal/organizations/{slug}/connect/account-id` — statut d'autorisation de
 * paiement de l'organisation, seul calcul de ce prédicat dans tout l'écosystème
 * (PaymentAuthorizationService côté SterPlatform). `null` : pas de compte Stripe Connect
 * pour cette organisation (409/404), distinct d'une erreur réseau qui doit remonter.
 */
export async function getStripeConnectStatus(slug: string): Promise<StripeConnectStatus | null> {
  const res = await internalFetch(`/api/internal/organizations/${encodeURIComponent(slug)}/connect/account-id`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SterPlatform connect status ${res.status}`);
  return res.json() as Promise<StripeConnectStatus>;
}

export type CreatePaymentCheckoutParams = {
  organizationSlug: string;
  externalReference: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
};

export type PaymentCheckout = {
  paymentId: string;
  checkoutUrl: string;
  status: string;
};

/**
 * `POST /api/internal/organizations/{slug}/payments/checkout` — remplace la création directe
 * d'une session Stripe Checkout. Idempotent sur (organisation, produit, externalReference)
 * côté SterPlatform : un retry avec la même référence renvoie le même Payment, jamais une
 * session dupliquée.
 */
export async function createPaymentCheckout(params: CreatePaymentCheckoutParams): Promise<{ checkout?: PaymentCheckout; error?: string }> {
  const res = await internalFetch(`/api/internal/organizations/${encodeURIComponent(params.organizationSlug)}/payments/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      product: 'DARTSOPEN',
      externalReference: params.externalReference,
      amountCents: params.amountCents,
      currency: params.currency,
      platformFeeCents: params.platformFeeCents,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      customerEmail: params.customerEmail,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return { error: body?.error ?? `Erreur SterPlatform (${res.status})` };
  }

  return { checkout: await res.json() as PaymentCheckout };
}

export type PaymentRecord = {
  paymentId: string;
  status: string;
  externalReference: string;
};

/**
 * `GET /api/internal/payments/{id}` — état complet et source de vérité d'un paiement
 * SterPlatform (DARTSOPEN-MONETIZATION-004, P1). Utilisé pour trancher un statut HTTP 409
 * ambigu de refund() (voir ci-dessous) : SterPlatform distingue "déjà remboursé" (succès du
 * point de vue de DartsOpen) de "non remboursable" (échec réel) par le même code 409, jamais
 * par un message d'erreur à parser — seule une relecture explicite du statut réel permet de
 * distinguer les deux sans ambiguïté.
 */
export async function getPayment(paymentId: string): Promise<PaymentRecord | null> {
  try {
    const res = await internalFetch(`/api/internal/payments/${encodeURIComponent(paymentId)}`);
    if (!res.ok) return null;
    return await res.json() as PaymentRecord;
  } catch {
    return null;
  }
}

/**
 * DARTSOPEN-MONETIZATION-003/004 (P1, contre-audit) — `POST /api/internal/payments/{id}/refund`,
 * remboursement total (SterPlatform, Module Payments — voir son CLAUDE.md). Seul cas d'usage
 * aujourd'hui : un paiement en ligne confirmé après coup (webhook `payment.succeeded` tardif)
 * alors que la place n'est plus disponible pour cette inscription (capacité reprise, ou tournoi
 * plus dans un état permettant l'inscription) — jamais silencieusement gardé, jamais transformé
 * en inscription illégitime (voir dbConfirmPendingPayment(), lib/db/tournament.ts).
 *
 * Quatre issues distinctes (DARTSOPEN-MONETIZATION-004) — jamais un simple booléen :
 * - REFUNDED : remboursement confirmé, synchrone (le Payment renvoyé est déjà au statut REFUNDED
 *   — cas Stripe le plus courant pour une carte).
 * - PENDING : remboursement accepté par Stripe mais pas encore confirmé (certains moyens de
 *   paiement) — SterPlatform notifiera `payment.refunded` plus tard, une fois `charge.refunded`
 *   reçu côté Stripe. Ce n'est PAS un échec : ne doit jamais déclencher de nouvelle tentative.
 * - ALREADY_REFUNDED : SterPlatform répond 409 (`PaymentAlreadyRefundedException`) — un appel
 *   précédent (ou le webhook `payment.refunded` lui-même) a déjà confirmé ce remboursement.
 *   Jamais deviné depuis le message d'erreur : confirmé par une relecture explicite via
 *   getPayment() (`status === 'REFUNDED'`) avant de conclure.
 * - FAILED : tout le reste (réseau, timeout, 5xx, Stripe a refusé, paiement non remboursable) —
 *   converge par un nouvel appel ultérieur (voir le webhook, qui répond alors un statut non-2xx
 *   pour permettre une redélivraison).
 */
export type RefundOutcome =
  | { outcome: 'REFUNDED' }
  | { outcome: 'PENDING' }
  | { outcome: 'ALREADY_REFUNDED' }
  | { outcome: 'FAILED'; error: string };

export async function refundPayment(paymentId: string): Promise<RefundOutcome> {
  try {
    const res = await internalFetch(`/api/internal/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
    });

    if (res.ok) {
      const body = await res.json() as { status: string };
      return body.status === 'REFUNDED' ? { outcome: 'REFUNDED' } : { outcome: 'PENDING' };
    }

    if (res.status === 409) {
      // Ambigu par construction (voir docblock) : ne jamais conclure depuis le corps de la
      // réponse, toujours relire l'état réel.
      const payment = await getPayment(paymentId);
      if (payment?.status === 'REFUNDED') {
        return { outcome: 'ALREADY_REFUNDED' };
      }
      const body = await res.json().catch(() => null) as { error?: string } | null;
      return { outcome: 'FAILED', error: body?.error ?? 'Paiement non remboursable (409).' };
    }

    const body = await res.json().catch(() => null) as { error?: string } | null;
    return { outcome: 'FAILED', error: body?.error ?? `Erreur SterPlatform (${res.status})` };
  } catch (err) {
    return { outcome: 'FAILED', error: err instanceof Error ? err.message : String(err) };
  }
}
