import { NextRequest, NextResponse } from "next/server";
import { generateSubscriberToken, mercureTopic } from "@/lib/mercure";

/**
 * GET /api/public/tournaments/:id/mercure-token
 *
 * Génère un JWT Mercure abonné pour le navigateur.
 * Retourne { token, topic } que le client utilise pour ouvrir une EventSource.
 * Si MERCURE_JWT_SECRET n'est pas configuré, retourne 503.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (!process.env.MERCURE_JWT_SECRET) {
    return NextResponse.json({ error: "Mercure non configuré" }, { status: 503 });
  }

  const topic = mercureTopic(id);
  const token = generateSubscriberToken(id);

  return NextResponse.json({ token, topic });
}
