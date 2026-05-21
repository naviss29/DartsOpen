import { NextRequest, NextResponse } from 'next/server';

const TOKEN_COOKIE = 'ster_token';
const REFRESH_COOKIE = 'ster_refresh_token';

const PROTECTED_PREFIXES = ['/dashboard', '/tournaments', '/settings'];

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const accessToken = req.cookies.get(TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  // Token présent — laisser passer, getUser() validera côté serveur
  if (accessToken) return NextResponse.next();

  // Pas de refresh token → redirection login
  if (!refreshToken) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Tenter le refresh
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
    const orgSlug = process.env.STER_ORG_SLUG ?? 'dartsopen';

    const res = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Organization-Slug': orgSlug,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const data = await res.json();
    const response = NextResponse.next();

    response.cookies.set(TOKEN_COOKIE, data.token, {
      ...COOKIE_BASE,
      maxAge: 60 * 60,
    });
    response.cookies.set(REFRESH_COOKIE, data.refresh_token, {
      ...COOKIE_BASE,
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/tournaments/:path*', '/settings/:path*'],
};
