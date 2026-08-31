import { apiFetch } from './client';
import { getServerToken } from './auth';

/**
 * `GET /api/me/organizations` — organisations BApps Studio de l'utilisateur connecté
 * (source unique côté SterPlatform, également consommée par BSsite/BilletAsso). Authentifié
 * par le JWT de l'organisateur (`ster_token`), pas par le jeton serveur-à-serveur.
 */
export type MyOrganization = {
  slug: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  verified: boolean;
  subscriptions: { product: string; plan: string; status: string }[];
};

export async function getMyOrganizations(): Promise<MyOrganization[] | null> {
  const token = await getServerToken();
  if (!token) return null;

  try {
    const res = await apiFetch('/api/me/organizations', {}, token);
    if (!res.ok) return null;
    return await res.json() as MyOrganization[];
  } catch {
    return null;
  }
}

export type PaymentAuthorizationStatus =
  | 'NO_ACCOUNT'
  | 'ONBOARDING_INCOMPLETE'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'RESTRICTED'
  | 'CHARGES_DISABLED'
  | 'PAYOUTS_DISABLED'
  | 'OPERATIONAL';

export type PaymentAuthorization = {
  status: PaymentAuthorizationStatus;
  statusLabel: string;
  canReceivePayments: boolean;
  reason: string | null;
};

/**
 * `GET /api/organizations/{slug}/payment-authorization` — JWT, exactement l'endpoint que la
 * page Stripe de BSsite appelle elle-même (SterPlatform CLAUDE.md, §Stripe Connect). Utilisé
 * pour tout contrôle organisateur authentifié (DartsOpen n'a jamais lui-même de session
 * anonyme ici) à la place du lookup serveur-à-serveur
 * (`lib/api/sterplatformInternal.ts::getStripeConnectStatus`, réservé au parcours d'inscription
 * publique, sans JWT) : garantit une parité strictement identique avec ce que l'organisateur
 * voit déjà dans BSsite, et élimine toute divergence liée à un jeton serveur-à-serveur mal
 * configuré (DARTSOPEN-MONETIZATION-001 — cause racine du bug "Stripe Connect non
 * opérationnel" constaté alors qu'il l'était réellement). `cache: 'no-store'` : jamais un état
 * de paiement mis en cache. Tout échec est journalisé — jamais un `.catch(() => null)` muet
 * (règle déjà documentée, CLAUDE.md §Gestion des erreurs).
 */
export async function getPaymentAuthorization(slug: string): Promise<PaymentAuthorization | null> {
  const token = await getServerToken();
  if (!token) return null;

  try {
    const res = await apiFetch(
      `/api/organizations/${encodeURIComponent(slug)}/payment-authorization`,
      { cache: 'no-store' },
      token,
    );
    if (!res.ok) {
      console.error('[getPaymentAuthorization] SterPlatform responded', res.status, slug);
      return null;
    }
    return await res.json() as PaymentAuthorization;
  } catch (err) {
    console.error('[getPaymentAuthorization] request failed', slug, err);
    return null;
  }
}

/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-005/DO-AUD-006) — `GET
 * /api/organizations/{slug}/subscription/optional-access?product=X`, MANAGE-gated
 * (OWNER/ADMIN) server-side. Replaces reading raw `subscriptions[]` from getMyOrganizations()
 * for the >10-player entitlement decision: that only reflected billing status
 * (ACTIVE/TRIALING) and never accounted for the caller's role or for OrganizationProduct
 * governance suspension — both now computed once, server-side, by SterPlatform
 * (`OrganizationProductService::hasEffectiveOptionalSubscriptionAccess()`), never re-derived
 * here ("ne duplique pas la logique SterPlatform dans DartsOpen").
 *
 * A 403 (caller isn't OWNER/ADMIN of the linked organization) is treated identically to a
 * genuine "no access" determination — never surfaced as an indeterminate error, since the
 * caller's own role is a fact DartsOpen already knows it can't change by retrying.
 */
export async function hasOptionalSubscriptionAccess(slug: string, productKey: string): Promise<boolean> {
  const token = await getServerToken();
  if (!token) return false;

  try {
    const res = await apiFetch(
      `/api/organizations/${encodeURIComponent(slug)}/subscription/optional-access?product=${encodeURIComponent(productKey)}`,
      { cache: 'no-store' },
      token,
    );
    if (!res.ok) {
      if (res.status !== 403) {
        console.error('[hasOptionalSubscriptionAccess] SterPlatform responded', res.status, slug);
      }
      return false;
    }
    const data = await res.json() as { accessGranted: boolean };
    return data.accessGranted === true;
  } catch (err) {
    console.error('[hasOptionalSubscriptionAccess] request failed', slug, err);
    return false;
  }
}


export type OrganizationProductsSummary = {
  activeProducts: Array<{ product: string }>;
};

/**
 * Résumé des produits actifs pour alimenter le switcher transverse.
 * SterPlatform reste l'unique source de vérité des droits.
 */
export async function getMyOrganizationsProducts(): Promise<OrganizationProductsSummary[] | null> {
  const token = await getServerToken();
  if (!token) return null;

  try {
    const res = await apiFetch('/api/me/organizations/summary', {}, token);
    if (!res.ok) return null;
    return await res.json() as OrganizationProductsSummary[];
  } catch {
    return null;
  }
}
