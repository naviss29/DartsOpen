import { NextResponse, type NextRequest } from "next/server";

// Ancienne route Supabase OTP — plus utilisée, redirige vers /login
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
