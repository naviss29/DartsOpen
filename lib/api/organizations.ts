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
