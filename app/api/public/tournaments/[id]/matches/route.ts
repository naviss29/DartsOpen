import { NextRequest, NextResponse } from "next/server";
import { dbListMatches } from "@/lib/db/tournament";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);

  const queryParams: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    queryParams[key] = value;
  }

  const matches = await dbListMatches(id, queryParams).catch(() => []);
  return NextResponse.json(matches);
}
