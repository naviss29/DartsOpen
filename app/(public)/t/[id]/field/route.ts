import { NextRequest, NextResponse } from "next/server";
import { dbGetTournamentPublic, dbListMatches } from "@/lib/db/tournament";
import { issueFieldSession } from "@/lib/actions/fieldAccess";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DO-FIELD-ACCESS-001 — cible du QR code imprimé sur chaque plateau : `/t/{id}/field?board=N`
 * (`&role=referee` pour le second QR, réservé à l'organisateur — voir pools/page.tsx). Le QR
 * imprimé est stable, mais le droit de saisir dépend de l'état serveur AU MOMENT DU SCAN, jamais
 * de la seule possession de l'URL : cette route relit toujours le match actuellement
 * `IN_PROGRESS` sur cette cible et n'émet une session terrain que s'il y en a un. Un ancien QR
 * (même URL) rescanné après la fin du match ne donne donc accès à rien de plus qu'un visiteur
 * sans session — la page `/score` affichera son état d'attente habituel.
 *
 * Toujours une redirection vers la page de saisie existante (jamais de nouvelle page dédiée) :
 * son état "Aucun match en cours sur cette cible" sert déjà d'écran d'attente correct quand
 * aucune session n'a pu être émise.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: tournamentId } = await params;
  const boardParam = request.nextUrl.searchParams.get("board");
  const boardNumber = parseInt(boardParam ?? "1", 10);
  const role = request.nextUrl.searchParams.get("role") === "referee" ? "REFEREE" : "PLAYER";

  const redirectUrl = new URL(`/t/${tournamentId}/score`, request.url);
  if (Number.isFinite(boardNumber)) {
    redirectUrl.searchParams.set("board", String(boardNumber));
  }

  const tournament = await dbGetTournamentPublic(tournamentId).catch(() => null);
  if (tournament && tournament.status === "IN_PROGRESS" && Number.isFinite(boardNumber)) {
    const matches = await dbListMatches(tournamentId).catch(() => [] as { id: string; board_number: number; status: string }[]);
    const activeMatch = matches.find((m) => m.board_number === boardNumber && m.status === "IN_PROGRESS");
    if (activeMatch) {
      await issueFieldSession(tournamentId, activeMatch.id, role);
    }
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
