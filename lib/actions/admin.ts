"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/api/auth";
import { dbArbitrateMatch } from "@/lib/db/tournament";
import { doAdvanceQuickTournament } from "@/lib/actions/quickTournament";
import { publishMatchUpdate } from "@/lib/mercure";

/**
 * Corrige manuellement le résultat d'un match (arbitrage organisateur).
 *
 * En mode standard : recalcule le vainqueur et supprime les rounds suivants
 * pour forcer une régénération manuelle du bracket.
 *
 * En mode rapide : recalcule le vainqueur et déclenche l'avancement automatique
 * du bracket (doAdvanceQuickTournament). Pas de suppression de matchs : le bracket
 * est dynamique et chaque match est indépendant.
 */
export async function arbitrateMatch(
  matchId: string,
  tournamentId: string,
  setWinners: { setId: string; winnerId: string | null }[]
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) redirect("/login");

  const result = await dbArbitrateMatch(matchId, setWinners).catch(() => ({
    error: "Erreur lors de la correction du match.",
  }));
  if (result.error) return result;

  // En mode rapide, l'avancement du bracket est déclenché automatiquement
  // (mêmes effets qu'après markWinnerDirect)
  if (result.matchFinished && result.match?.quickMode) {
    await doAdvanceQuickTournament(tournamentId, matchId).catch((err) =>
      console.warn("[arbitrateMatch] doAdvanceQuickTournament:", err)
    );
  }

  // Notifie les clients en temps réel (Mercure) ou force un re-fetch (polling)
  if (result.matchFinished) {
    publishMatchUpdate(tournamentId).catch(() => {});
  }

  revalidatePath(`/tournaments/${tournamentId}/pools`);
  revalidatePath(`/tournaments/${tournamentId}/bracket`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}
