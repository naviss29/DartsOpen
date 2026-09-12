import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// Readiness : l'application ne peut traiter ses fonctions métier sans PostgreSQL.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", checks: { database: "ok" } });
  } catch {
    return NextResponse.json(
      { status: "error", checks: { database: "unreachable" } },
      { status: 503 },
    );
  }
}
