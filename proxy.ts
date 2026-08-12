import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { ssoStartPath } from "@/lib/sso/redirect";
import { buildSecurityHeaders } from "@/lib/securityHeaders";

const TOKEN_COOKIE = 'ster_token';
const REFRESH_COOKIE = 'ster_refresh_token';

const PROTECTED_PREFIXES = ['/dashboard', '/tournaments', '/settings'];

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// /login, /register, /forgot-password, /reset-password n'existent plus en local (migration
// écosystème SSO — voir /api/auth/sso/start) : le rate limiting du login lui-même est déjà
// assuré côté SterPlatform (AuthRateLimiterSubscriber, 5 tentatives/minute/IP).
const RATE_LIMIT_RULES: { prefix: string; windowMs: number; max: number }[] = [
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

// SEC-006 — point d'application unique des headers de sécurité : toute réponse produite par
// handleRequest() (rate limit 429, redirect SSO, ou pass-through) les reçoit avant de partir,
// sans dupliquer la logique de rate limiting/authentification ci-dessous.
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await handleRequest(request);
  const headers = buildSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const rule = RATE_LIMIT_RULES.find((r) => pathname.startsWith(r.prefix));
  if (rule) {
    const key = `${rule.prefix}:${clientIp(request.headers)}`;
    const result = await checkRateLimit(key, rule);
    if (!result.allowed) return rateLimitResponse(request, result.retryAfterSeconds);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const accessToken = request.cookies.get(TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken) return NextResponse.next();

  if (!refreshToken) {
    return NextResponse.redirect(new URL(ssoStartPath(pathname), request.url));
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
      return NextResponse.redirect(new URL(ssoStartPath(pathname), request.url));
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
    return NextResponse.redirect(new URL(ssoStartPath(pathname), request.url));
  }
}

export const config = {
  // SEC-005 — checkRateLimit() interroge désormais PostgreSQL via le pilote `pg` réel (lib/db/
  // client.ts). Next.js 16 a remplacé `middleware.ts` par `proxy.ts` précisément pour que ce
  // fichier tourne toujours en runtime Node.js (jamais Edge) — donc jamais besoin (et jamais
  // permis, "Route segment config is not allowed in Proxy file") de déclarer `runtime` ici,
  // contrairement à l'ancien middleware.ts pré-Next 16.
  // SEC-006 — élargi à toutes les routes (headers de sécurité partout), plus seulement les
  // prefixes gardés par le rate limiting/SSO : handleRequest() ne fait rien de plus qu'un
  // pass-through en dehors de RATE_LIMIT_RULES/PROTECTED_PREFIXES, élargir ce matcher n'ajoute
  // donc aucune vérification supplémentaire sur les routes déjà publiques.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
