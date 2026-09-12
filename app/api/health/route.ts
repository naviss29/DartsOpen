import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

// Endpoint historique conservé comme liveness Docker : il répond toujours HTTP 200,
// tout en publiant l'état non sensible de la base pour la supervision.
export async function GET() {
  let database: "ok" | "unreachable" = "unreachable";

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "unreachable";
  }

  return NextResponse.json({ status: "ok", database });
}
