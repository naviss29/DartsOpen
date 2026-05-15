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

async function tryRefresh(): Promise<string | null> {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;

  const res = await apiFetch('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  await setAuthCookies(data.token, data.refresh_token);
  return data.token;
}

export type SterUser = {
  id: string;
  email: string;
  roles: string[];
  isVerified: boolean;
};

export async function getUser(): Promise<SterUser | null> {
  let token = await getServerToken();
  if (!token) return null;

  let res = await apiFetch('/api/auth/me', {}, token);

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) return null;
    res = await apiFetch('/api/auth/me', {}, refreshed);
  }

  if (!res.ok) return null;
  return res.json() as Promise<SterUser>;
}
