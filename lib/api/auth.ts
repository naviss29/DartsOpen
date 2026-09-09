import { cache } from 'react';
import { cookies } from 'next/headers';
import { apiFetch } from './client';

export const TOKEN_COOKIE = 'ster_token';
export const REFRESH_COOKIE = 'ster_refresh_token';

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function getServerToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

export async function getServerRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value;
}

export async function setAuthCookies(token: string, refreshToken: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, { ...COOKIE_BASE, maxAge: 60 * 60 });
  store.set(REFRESH_COOKIE, refreshToken, { ...COOKIE_BASE, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(REFRESH_COOKIE);
}


export type SterUser = {
  id: string;
  email: string;
  roles: string[];
  isVerified: boolean;
};

// Perf pré-recette (D3) — chaque appel effectuait un aller-retour réseau vers SterPlatform
// /api/auth/me (choix volontaire pour la fraîcheur des rôles/JWT, conservé tel quel). Sans
// mémoïsation, le layout du dashboard ET chaque page/Server Action enfant appelaient getUser()
// indépendamment, multipliant les appels à SterPlatform pour un seul rendu de page. cache()
// (React) déduplique au sein d'un même rendu serveur, jamais entre deux requêtes distinctes —
// aucun changement de comportement de fraîcheur inter-requêtes.
export const getUser = cache(async (): Promise<SterUser | null> => {
  const token = await getServerToken();
  if (!token) return null;

  try {
    const res = await apiFetch('/api/auth/me', {}, token);
    if (!res.ok) return null;
    return res.json() as Promise<SterUser>;
  } catch {
    return null;
  }
});
