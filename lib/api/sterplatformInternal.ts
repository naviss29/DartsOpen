/**
 * Client server-to-server vers l'API interne de SterPlatform (`/api/internal/**`, mission
 * DO-003) — authentifié par `X-App-Token` (même mécanisme et même jeton que
 * lib/api/sterplatform.ts::sendEmail, `ServerTokenAuthenticator` côté SterPlatform accepte
 * un seul jeton par module quel que soit l'endpoint appelé). Remplace toute logique Stripe
 * locale : DartsOpen ne dialogue plus jamais directement avec Stripe, uniquement avec
 * SterPlatform, qui gère Stripe Connect pour le compte de l'organisation. Porte aussi
 * `sendEmailToUser` (`/api/email/send-to-user`, hors `/api/internal`) : même jeton de module, et
 * contrairement à `sendEmail` (lib/api/sterplatform.ts) une issue typée, jamais une exception.
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
  | 'ACCOUNT_INACCESSIBLE'
  | 'CARD_PAYMENTS_UNAVAILABLE'
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
 *
 * ADR-0022 : une inscription est une vente DE l'organisation — encaissée directement sur son
 * compte Stripe (direct charge). C'est le comportement par défaut de SterPlatform (`payee`
 * absent = ORGANIZATION) : ne jamais envoyer `payee: "PLATFORM"` ici, réservé aux achats faits
 * à BApps (les crédits tournoi DartsOpen passent d'ailleurs par BSsite, pas par ce module).
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
  /**
   * PAY-003 (SterPlatform) — état du dernier remboursement « paiement entier » :
   * null | PENDING | SUCCEEDED | FAILED. Seul moyen de distinguer « remboursement encore en
   * cours » de « remboursement échoué » (les deux laissent le paiement SUCCEEDED) — F13.
   */
  refundStatus?: string | null;
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

/**
 * Issue d'un envoi `send-to-user` — jamais un simple booléen : l'appelant (purge des tournois
 * non terminés) doit distinguer ce qui autorise une suppression future (SENT uniquement), ce qui
 * est un problème de données propre à un destinataire (RECIPIENT_NOT_FOUND), ce qui casse TOUS
 * les envois (CONFIGURATION_ERROR : jeton refusé, template absent) et le reste, transitoire
 * (FAILED : 400, 5xx, réseau).
 */
export type SendEmailToUserOutcome =
  | { outcome: 'SENT' }
  | { outcome: 'RECIPIENT_NOT_FOUND' }
  | { outcome: 'CONFIGURATION_ERROR'; status: number; error: string }
  | { outcome: 'FAILED'; status?: number; error: string };

/**
 * `POST /api/email/send-to-user` (EMAIL-SCOPE-001) — envoie un template `dartsopen_*` à UN
 * utilisateur désigné par son identifiant SterPlatform. DartsOpen ne connaît jamais l'adresse
 * email du créateur d'un tournoi (ARCH-001 : SterPlatform possède User) ; SterPlatform la résout
 * et ne la renvoie pas. Même client et même jeton de module (`STER_API_TOKEN`) que les autres
 * appels serveur-à-serveur : `ServerTokenAuthenticator` accepte un jeton par module, quel que
 * soit l'endpoint.
 *
 * 404 : deux causes à ne pas confondre — `code: USER_NOT_FOUND` (utilisateur inexistant, supprimé
 * ou membre d'aucune organisation où DartsOpen est actif : propre à CE destinataire) contre un
 * template introuvable (non seedé côté SterPlatform : casse TOUS les envois → configuration).
 * Ne lève jamais : toute exception (réseau, JSON) devient FAILED.
 */
export async function sendEmailToUser(
  template: string,
  userId: string,
  variables: Record<string, string>,
): Promise<SendEmailToUserOutcome> {
  try {
    const res = await internalFetch('/api/email/send-to-user', {
      method: 'POST',
      body: JSON.stringify({ template, userId, variables }),
    });

    if (res.status === 200) {
      // Seul un 200 `{"sent":true}` prouve l'envoi : un autre 2xx ou un corps inattendu ne doit
      // jamais autoriser la suppression d'un tournoi (la règle repose sur un rappel réellement parti).
      const body = await res.json().catch(() => null) as { sent?: unknown } | null;
      if (body?.sent === true) return { outcome: 'SENT' };
      return { outcome: 'FAILED', status: res.status, error: 'Réponse 200 sans confirmation d\'envoi ("sent": true absent).' };
    }

    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
    const detail = body?.error ?? `HTTP ${res.status}`;

    if (res.status === 404) {
      if (body?.code === 'USER_NOT_FOUND') return { outcome: 'RECIPIENT_NOT_FOUND' };
      return { outcome: 'CONFIGURATION_ERROR', status: 404, error: `Template "${template}" introuvable côté SterPlatform (${detail}).` };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        outcome: 'CONFIGURATION_ERROR',
        status: res.status,
        error: `SterPlatform refuse l'appel (${res.status}) : jeton de module STER_API_TOKEN invalide, legacy ou template hors périmètre (${detail}).`,
      };
    }
    return { outcome: 'FAILED', status: res.status, error: `SterPlatform send-to-user ${res.status} : ${detail}` };
  } catch (err) {
    return { outcome: 'FAILED', error: `SterPlatform injoignable : ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Issue d'un envoi `send-to-organization`. Volontairement distincte de `SendEmailToUserOutcome` :
 * SterPlatform n'y renvoie aucun code machine sur ses 404, et un 422 signifie « aucun
 * OWNER/ADMIN actif à prévenir ».
 * - SENT : 200 `{"sent":true}` (au moins un administrateur a reçu l'email) ;
 * - NOT_FOUND : 404, organisation inconnue OU template non seedé — indiscernables sans analyser
 *   le message d'erreur (jamais fait ici) ;
 * - NO_RECIPIENT : 422, organisation sans OWNER/ADMIN actif ;
 * - CONFIGURATION_ERROR : 401/403 (jeton refusé, jeton legacy, template hors périmètre du module) ;
 * - FAILED : 400, 5xx, réseau, 200 sans confirmation.
 */
export type SendEmailToOrganizationOutcome =
  | { outcome: 'SENT'; recipientCount: number | null }
  | { outcome: 'NOT_FOUND'; error: string }
  | { outcome: 'ORGANIZATION_NOT_FOUND'; error: string }
  | { outcome: 'NO_RECIPIENT'; error: string }
  | { outcome: 'CONFIGURATION_ERROR'; status: number; error: string }
  | { outcome: 'FAILED'; status?: number; error: string };

/**
 * `POST /api/email/send-to-organization` (EMAIL-SCOPE-001, D6 d'ADR-0021) — envoie un template
 * `dartsopen_*` à TOUS les OWNER/ADMIN actifs d'une organisation, désignée par son UUID
 * SterPlatform (`Tournament.organizationId`). Même contrat que celui déjà utilisé par BilletAsso
 * (`billetasso_remboursement_echoue`) : DartsOpen ne connaît ni ne reçoit aucune adresse
 * (ARCH-001). Même jeton de module que `sendEmailToUser` (`STER_API_TOKEN`) ; le jeton legacy
 * est refusé en 403. Ne lève jamais : toute exception (réseau, JSON) devient FAILED.
 */
export async function sendEmailToOrganization(
  template: string,
  organizationId: string,
  variables: Record<string, string>,
): Promise<SendEmailToOrganizationOutcome> {
  try {
    const res = await internalFetch('/api/email/send-to-organization', {
      method: 'POST',
      body: JSON.stringify({ template, organizationId, variables }),
    });

    if (res.status === 200) {
      // Même exigence que send-to-user : seul `sent: true` prouve un envoi réel (la purge ne
      // supprime un tournoi qu'après un rappel réellement parti).
      const body = await res.json().catch(() => null) as { sent?: unknown; recipientCount?: unknown } | null;
      if (body?.sent === true) {
        return { outcome: 'SENT', recipientCount: typeof body.recipientCount === 'number' ? body.recipientCount : null };
      }
      return { outcome: 'FAILED', status: res.status, error: 'Réponse 200 sans confirmation d\'envoi ("sent": true absent).' };
    }

    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
    const detail = body?.error ?? `HTTP ${res.status}`;

    // Codes machine de SterPlatform (01/10/2026) : seule une organisation réellement disparue
    // peut entraîner une action destructive côté appelant ; un template manquant est une erreur
    // de configuration. Un 404 SANS code (SterPlatform plus ancien) reste ambigu : traité comme
    // un échec ordinaire, jamais comme une organisation disparue.
    if (res.status === 404 && body?.code === 'ORGANIZATION_NOT_FOUND') {
      return { outcome: 'ORGANIZATION_NOT_FOUND', error: `Organisation introuvable côté SterPlatform (${detail}).` };
    }
    if (res.status === 404 && body?.code === 'TEMPLATE_NOT_FOUND') {
      return { outcome: 'CONFIGURATION_ERROR', status: 404, error: `Template "${template}" absent de SterPlatform (${detail}).` };
    }
    if (res.status === 404) {
      return { outcome: 'NOT_FOUND', error: `Organisation ou template "${template}" introuvable côté SterPlatform (${detail}).` };
    }
    if (res.status === 422) {
      return { outcome: 'NO_RECIPIENT', error: `Aucun propriétaire ni administrateur actif à prévenir dans l'organisation (${detail}).` };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        outcome: 'CONFIGURATION_ERROR',
        status: res.status,
        error: `SterPlatform refuse l'appel (${res.status}) : jeton de module STER_API_TOKEN invalide, legacy ou template hors périmètre (${detail}).`,
      };
    }
    return { outcome: 'FAILED', status: res.status, error: `SterPlatform send-to-organization ${res.status} : ${detail}` };
  } catch (err) {
    return { outcome: 'FAILED', error: `SterPlatform injoignable : ${err instanceof Error ? err.message : String(err)}` };
  }
}
