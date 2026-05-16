"use server";

import { revalidatePath } from "next/cache";
import {
  dbProposeWinner,
  dbConfirmWinner,
  dbDisputeResult,
  dbMarkWinnerDirect,
} from "@/lib/db/tournament";
import { doAdvanceToNextRound } from "@/lib/actions/bracket";

export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2
): Promise<{ error?: string }> {
  const result = await dbProposeWinner(matchSetId, winnerId, playerSide).catch(() => ({
    error: "Erreur lors de la saisie du score.",
    set: null as never,
  }));
  if (result.error) return { error: result.error };
  return {};
}

export async function confirmWinner(
  matchSetId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string; disputed?: boolean }> {
  const result = await dbConfirmWinner(matchSetId, playerSide).catch(() => ({
    error: "Erreur lors de la confirmation.",
  }));
  if (result.error) return { error: result.error };

  if (result.matchFinished && result.match?.bracketRound !== null && result.match?.bracketRound !== undefined) {
    await doAdvanceToNextRound(tournamentId, result.match.bracketRound).catch(() => null);
  }

  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

export async function markWinnerDirect(
  matchSetId: string,
  winnerId: string,
  tournamentId: string
): Promise<{ error?: string }> {
  const result = await dbMarkWinnerDirect(matchSetId, winnerId).catch(() => ({
    error: "Erreur lors de la saisie du score.",
  }));
  if (result.error) return { error: result.error };

  if (result.matchFinished && result.match?.bracketRound !== null && result.match?.bracketRound !== undefined) {
    await doAdvanceToNextRound(tournamentId, result.match.bracketRound).catch(() => null);
  }

  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

export async function disputeResult(
  matchSetId: string,
  tournamentId: string
): Promise<{ error?: string }> {
  const result = await dbDisputeResult(matchSetId).catch(() => ({
    error: "Erreur lors de la contestation.",
  }));
  if (result.error) return { error: result.error };

  revalidatePath(`/t/${tournamentId}/score`);
  return {};
}
