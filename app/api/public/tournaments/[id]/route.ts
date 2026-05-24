import { NextRequest, NextResponse } from "next/server";
import { dbGetTournamentPublic } from "@/lib/db/tournament";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await dbGetTournamentPublic(id).catch(() => null);
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tournament);
}
