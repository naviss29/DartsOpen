import { NextResponse } from "next/server";
import { isLocale, localeCookieName } from "@/lib/i18n/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = body?.locale;

  if (!isLocale(locale)) {
    return NextResponse.json({ error: "unsupported_locale" }, { status: 400 });
  }

  const response = NextResponse.json({ locale });
  const hostname = new URL(request.url).hostname.toLowerCase();
  const domain = hostname === "bapps-studio.com" || hostname.endsWith(".bapps-studio.com")
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
