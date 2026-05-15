import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ['/dashboard', '/tournaments', '/settings'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !request.cookies.get('ster_token')?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/tournaments/:path*', '/settings/:path*'],
};
