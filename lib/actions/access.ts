import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { dbGetTournament } from "@/lib/db/tournament";

export async function getOwnedTournament(tournamentId: string) {
  const user = await getUser();
  if (!user) redirect("/login");

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.association_id !== user.id) notFound();

  return tournament;
}

/**
 * DO-FIELD-ACCESS-001 — variante non-throwing de getOwnedTournament() : `null` si l'utilisateur
 * n'est pas authentifié ou ne possède pas ce tournoi, jamais un redirect()/notFound() (ces
 * throws spéciaux Next.js n'ont de sens que pour une page qui EXIGE un accès organisateur).
 * Utilisée pour tenter l'accès organisateur avant de retomber sur un accès terrain temporaire
 * (lib/actions/fieldAccess.ts::authorizeScoring) — jamais l'inverse, l'accès organisateur reste
 * toujours prioritaire et inchangé dans son comportement propre.
 */
export async function getOwnedTournamentOrNull(tournamentId: string) {
  const user = await getUser();
  if (!user) return null;

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.association_id !== user.id) return null;

  return tournament;
}
