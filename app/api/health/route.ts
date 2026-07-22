import { NextResponse } from "next/server";

// Liveness uniquement — confirme que le serveur Next.js répond, jamais de
// dépendance externe (DB...) pour éviter qu'un ralentissement transitoire
// fasse échouer le healthcheck du conteneur.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
