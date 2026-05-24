import { NextRequest, NextResponse } from "next/server";
import { dbListPools } from "@/lib/db/tournament";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pools = await dbListPools(id).catch(() => []);
  return NextResponse.json(pools);
}
