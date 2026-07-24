import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

const TOKEN_COOKIE = 'ster_token';
const REFRESH_COOKIE = 'ster_refresh_token';

const PROTECTED_PREFIXES = ['/dashboard', '/tournaments', '/settings'];

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// Webhooks Stripe volontairement exclus : la signature Stripe fait déjà
// autorité sur la légitimité de la requête, et limiter par IP risquerait de
// bloquer des retries légitimes depuis les IP sortantes partagées de Stripe.
const RATE_LIMIT_RULES: { prefix: string; windowMs: number; max: number }[] = [
  { prefix: '/login', windowMs: 5 * 60_000, max: 10 },
  { prefix: '/register', windowMs: 15 * 60_000, max: 5 },
  { prefix: '/forgot-password', windowMs: 15 * 60_000, max: 5 },
  { prefix: '/reset-password', windowMs: 15 * 60_000, max: 5 },
  { prefix: '/api/public', windowMs: 60_000, max: 120 },
  // Limite volontairement large : un même lieu de tournoi (salle, gymnase)
  // peut voir plusieurs dizaines de joueurs partager la même IP publique
  // (NAT) pendant un événement en direct.
  { prefix: '/t/', windowMs: 5 * 60_000, max: 300 },
];

function rateLimitResponse(request: NextRequest, retryAfterSeconds: number) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  const body = isApi
    ? JSON.stringify({ error: 'Trop de requêtes, veuillez réessayer plus tard.' })
    : 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';

  return new NextResponse(body, {
    status: 429,
    headers: {
      'Content-Type': isApi ? 'application/json' : 'text/plain; charset=utf-8',
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rule = RATE_LIMIT_RULES.find((r) => pathname.startsWith(r.prefix));
  if (rule) {
    const key = `${rule.prefix}:${clientIp(request.headers)}`;
    const result = checkRateLimit(key, rule);
    if (!result.allowed) return rateLimitResponse(request, result.retryAfterSeconds);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const accessToken = request.cookies.get(TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken) return NextResponse.next();

  if (!refreshToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

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
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
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
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/tournaments/:path*',
    '/settings/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/api/public/:path*',
    '/t/:path*',
  ],
};
