import { NextResponse } from "next/server";
import { isLocale, localeCookieName } from "@/lib/i18n/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = body?.locale;

  if (!isLocale(locale)) {
    return NextResponse.json({ error: "unsupported_locale" }, { status: 400 });
  }

  const response = NextResponse.json({ locale });
  // Depuis NEXT_PUBLIC_APP_URL (URL publique connue de CETTE app), jamais request.url :
  // derrière le proxy Coolify, request.url reflète l'hôte interne du conteneur plutôt que le
  // domaine public — le cookie ne partait donc jamais avec l'attribut Domain en production
  // (trouvé le 2026-09-27 par le garde-fou request-url.guardrail.test.ts, voir la skill
  // bapps-api-security §SSO ; la préférence de langue ne se partageait silencieusement jamais
  // entre les sous-domaines *.bapps-studio.com malgré ce que ce code prétendait faire).
  const appHostname = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost").hostname.toLowerCase();
  const domain = appHostname === "bapps-studio.com" || appHostname.endsWith(".bapps-studio.com")
    ? "bapps-studio.com"
    : undefined;
  response.cookies.set(localeCookieName, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: domain !== undefined || process.env.NODE_ENV === "production",
    path: "/",
    ...(domain ? { domain } : {}),
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
