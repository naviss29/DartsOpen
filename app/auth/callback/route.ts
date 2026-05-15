import { NextResponse, type NextRequest } from "next/server";

// Ancienne route Supabase OAuth — redirige vers /dashboard si connecté, sinon /login
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const token = request.cookies.get('ster_token')?.value;
  return NextResponse.redirect(`${origin}${token ? '/dashboard' : '/login'}`);
}
