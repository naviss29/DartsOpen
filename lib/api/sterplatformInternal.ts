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
