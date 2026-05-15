"use server";

import { revalidatePath } from "next/cache";
import { apiProposeWinner, apiConfirmWinner, apiDisputeResult, apiMarkWinnerDirect } from "@/lib/api/tournament";

export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2
): Promise<{ error?: string }> {
  const res = await apiProposeWinner(matchSetId, winnerId, playerSide);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Erreur lors de la saisie du score." };
  }
  return {};
}

export async function confirmWinner(
  matchSetId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string; disputed?: boolean }> {
  const res = await apiConfirmWinner(matchSetId, playerSide);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Erreur lors de la confirmation." };
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
  const res = await apiMarkWinnerDirect(matchSetId, winnerId);
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    return { error: data.error ?? "Erreur lors de la saisie du score." };
  }
  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

export async function disputeResult(
  matchSetId: string,
  tournamentId: string
): Promise<{ error?: string }> {
  const res = await apiDisputeResult(matchSetId);
  if (!res.ok) return { error: "Erreur lors de la contestation." };
  revalidatePath(`/t/${tournamentId}/score`);
  return {};
}
