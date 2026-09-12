import { NextResponse } from "next/server";
import { isLocale, localeCookieName } from "@/lib/i18n/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = body?.locale;

  if (!isLocale(locale)) {
    return NextResponse.json({ error: "unsupported_locale" }, { status: 400 });
  }

  const response = NextResponse.json({ locale });
  response.cookies.set(localeCookieName, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
