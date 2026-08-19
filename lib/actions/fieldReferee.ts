"use server";

import { getOwnedTournament } from "@/lib/actions/access";
import { dbListMatches } from "@/lib/db/tournament";
import { createRefereeGrant } from "@/lib/actions/fieldAccess";
import { parseBoardNumber } from "@/lib/utils/fieldBoard";
import { generateQRCodeDataURL } from "@/lib/utils/qrcode";

/**
 * DO-FIELD-ACCESS-002 — seul point d'entrée qui peut faire naître un accès arbitre : protégé
 * par `getOwnedTournament` (throw si l'appelant n'est pas authentifié et propriétaire de CE
 * tournoi, comportement Next.js standard déjà utilisé partout ailleurs dans le dashboard —
 * jamais avalé par un `.catch()`). Corrige l'ancien défaut où `?role=referee` suffisait sur la
 * route publique : la preuve arbitre n'existe désormais que si CE parcours a été emprunté.
 *
 * Ne crée jamais la session terrain elle-même — seulement une preuve à usage unique
 * (`FieldRefereeGrant`, 15 min), échangée contre une vraie session REFEREE uniquement par
 * `GET /t/{id}/field/referee?proof=...` (voir ce Route Handler). Le QR affiché au dashboard
 * encode cette URL d'échange, jamais un simple `role=referee`.
 */
export async function generateRefereeAccess(
  tournamentId: string,
  board: string
): Promise<{ error?: string; qrDataUrl?: string; url?: string; expiresInMinutes?: number }> {
  const tournament = await getOwnedTournament(tournamentId);

  const boardNumber = parseBoardNumber(board, tournament.nb_boards);
  if (boardNumber === null) return { error: "Numéro de cible invalide." };

  if (tournament.status !== "IN_PROGRESS") {
    return { error: "Le tournoi n'est pas en cours." };
  }

  const matches = await dbListMatches(tournamentId).catch(() => [] as { id: string; board_number: number; status: string }[]);
  const activeMatch = matches.find((m) => m.board_number === boardNumber && m.status === "IN_PROGRESS");
  if (!activeMatch) return { error: "Aucun match en cours sur cette cible." };

  const proof = await createRefereeGrant(tournamentId, activeMatch.id);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/t/${tournamentId}/field/referee?proof=${proof}`;
  const qrDataUrl = await generateQRCodeDataURL(url);

  return { qrDataUrl, url, expiresInMinutes: 15 };
}
