import { NextRequest, NextResponse } from "next/server";
import { dbGetTournamentPublic, dbListMatches } from "@/lib/db/tournament";
import { issueFieldSession } from "@/lib/actions/fieldAccess";
import { parseBoardNumber } from "@/lib/utils/fieldBoard";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DO-FIELD-ACCESS-001/002 — cible du QR PUBLIC imprimé sur chaque plateau : `/t/{id}/field?board=N`.
 * Le QR imprimé est stable, mais le droit de saisir dépend de l'état serveur AU MOMENT DU SCAN,
 * jamais de la seule possession de l'URL : cette route relit toujours le match actuellement
 * `IN_PROGRESS` sur cette cible et n'émet une session terrain que s'il y en a un. Un ancien QR
 * (même URL) rescanné après la fin du match ne donne donc accès à rien de plus qu'un visiteur
 * sans session — la page `/score` affichera son état d'attente habituel.
 *
 * DO-FIELD-ACCESS-002 — cette route n'émet PLUS jamais qu'un rôle `PLAYER`, sans exception ni
 * paramètre. L'ancien `?role=referee` permettait une élévation publique vers REFEREE sans
 * aucune preuve serveur : ce défaut est corrigé en supprimant purement et simplement toute
 * lecture d'un paramètre de rôle ici — un arbitre ne peut plus obtenir sa session que via
 * `/t/{id}/field/referee?proof=...` (lib/actions/fieldReferee.ts génère cette preuve, réservée
 * à l'organisateur propriétaire du tournoi). Le numéro de cible est validé strictement
 * (parseBoardNumber, jamais un `parseInt()` nu qui acceptait silencieusement `"1abc"`), borné
 * par le nombre réel de cibles du tournoi quand celui-ci est connu.
 *
 * Toujours une redirection vers la page de saisie existante (jamais de nouvelle page dédiée) :
 * son état "Aucun match en cours sur cette cible" sert déjà d'écran d'attente correct quand
 * aucune session n'a pu être émise.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: tournamentId } = await params;
  const boardParam = request.nextUrl.searchParams.get("board");

  const tournament = await dbGetTournamentPublic(tournamentId).catch(() => null);
  const boardNumber = parseBoardNumber(boardParam, tournament?.nb_boards);

  const redirectUrl = new URL(`/t/${tournamentId}/score`, request.url);
  if (boardNumber !== null) {
    redirectUrl.searchParams.set("board", String(boardNumber));
  }

  if (tournament && tournament.status === "IN_PROGRESS" && boardNumber !== null) {
    const matches = await dbListMatches(tournamentId).catch(() => [] as { id: string; board_number: number; status: string }[]);
    const activeMatch = matches.find((m) => m.board_number === boardNumber && m.status === "IN_PROGRESS");
    if (activeMatch) {
      await issueFieldSession(tournamentId, activeMatch.id, "PLAYER");
    }
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  // DO-FIELD-ACCESS-002 — cette route peut poser un cookie de session : une réponse mise en
  // cache (proxy partagé, navigateur) rejouerait un Set-Cookie périmé pour un futur visiteur,
  // ou pire, servirait une redirection sans jamais réémettre de session à un visiteur légitime.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
