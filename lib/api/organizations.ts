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
