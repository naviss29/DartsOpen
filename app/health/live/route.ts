import { NextResponse } from "next/server";

// Liveness pure : aucune dépendance externe.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
