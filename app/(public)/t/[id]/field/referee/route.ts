import { NextRequest, NextResponse } from "next/server";
import { dbListMatches } from "@/lib/db/tournament";
import { redeemRefereeGrant, issueFieldSession } from "@/lib/actions/fieldAccess";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DO-FIELD-ACCESS-002 — seule route capable d'émettre une session terrain `REFEREE`. Jamais
 * atteignable en devinant une URL : `proof` est une preuve serveur opaque (FieldRefereeGrant,
 * 256 bits, hash SHA-256 en base, 15 min, usage unique — voir redeemRefereeGrant()), générée
 * exclusivement par l'organisateur propriétaire du tournoi (lib/actions/fieldReferee.ts::
 * generateRefereeAccess). Un visiteur qui ne connaît que `tournamentId`/`board`/l'URL publique
 * ne peut reconstruire aucune preuve valide : il n'y a ici aucun paramètre équivalent à l'ancien
 * `?role=referee`.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: tournamentId } = await params;
  const proof = request.nextUrl.searchParams.get("proof") ?? undefined;

  const redemption = await redeemRefereeGrant(proof, tournamentId);

  const redirectUrl = new URL(`/t/${tournamentId}/score`, request.url);
  if (redemption.ok) {
    const matches = await dbListMatches(tournamentId).catch(() => [] as { id: string; board_number: number }[]);
    const match = matches.find((m) => m.id === redemption.matchId);
    if (match) redirectUrl.searchParams.set("board", String(match.board_number));

    await issueFieldSession(tournamentId, redemption.matchId, "REFEREE");
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  // DO-FIELD-ACCESS-002 — cette route pose un cookie de session REFEREE : jamais mise en cache,
  // même raisonnement que la route PLAYER (/t/{id}/field).
  response.headers.set("Cache-Control", "no-store");
  return response;
}
