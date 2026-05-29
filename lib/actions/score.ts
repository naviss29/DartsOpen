"use server";

import { revalidatePath } from "next/cache";
import {
  dbProposeWinner,
  dbConfirmWinner,
  dbDisputeResult,
  dbMarkWinnerDirect,
  dbGetTournament,
} from "@/lib/db/tournament";
import { doAdvanceToNextRound } from "@/lib/actions/bracket";
import { doAdvanceQuickTournament } from "@/lib/actions/quickTournament";
import { publishMatchUpdate } from "@/lib/mercure";
import { getUser } from "@/lib/api/auth";

export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié." };

  const result = await dbProposeWinner(matchSetId, winnerId, playerSide).catch(() => ({
    error: "Erreur lors de la saisie du score.",
    set: null as never,
  }));
  if (result.error) return { error: result.error };

  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

export async function confirmWinner(
  matchSetId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string; disputed?: boolean }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié." };

  const result = await dbConfirmWinner(matchSetId, playerSide).catch(
    (): Awaited<ReturnType<typeof dbConfirmWinner>> => ({ error: "Erreur lors de la confirmation." })
  );
  if (result.error) return { error: result.error };

  if (result.matchFinished && result.match?.bracketRound !== null && result.match?.bracketRound !== undefined) {
    if (result.match.quickMode) {
      await doAdvanceQuickTournament(tournamentId, result.match.id).catch((err) =>
        console.warn("[confirmWinner] doAdvanceQuickTournament:", err)
      );
    } else {
      await doAdvanceToNextRound(tournamentId, result.match.bracketRound).catch(() => null);
    }
  }

  if (result.matchFinished) {
    publishMatchUpdate(tournamentId).catch(() => {});
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
  const user = await getUser();
  if (!user) return { error: "Non authentifié." };

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament || tournament.association_id !== user.id) {
    return { error: "Accès refusé." };
  }

  const result = await dbMarkWinnerDirect(matchSetId, winnerId).catch(
    (): Awaited<ReturnType<typeof dbMarkWinnerDirect>> => ({ error: "Erreur lors de la saisie du score." })
  );
  if (result.error) return { error: result.error };

  if (result.matchFinished && result.match?.bracketRound !== null && result.match?.bracketRound !== undefined) {
    if (result.match.quickMode) {
      await doAdvanceQuickTournament(tournamentId, result.match.id).catch((err) =>
        console.warn("[markWinnerDirect] doAdvanceQuickTournament:", err)
      );
    } else {
      await doAdvanceToNextRound(tournamentId, result.match.bracketRound).catch(() => null);
    }
  }

  if (result.matchFinished) {
    publishMatchUpdate(tournamentId).catch(() => {});
  }

  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

export async function disputeResult(
  matchSetId: string,
  tournamentId: string
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié." };

  const result = await dbDisputeResult(matchSetId).catch(() => ({
    error: "Erreur lors de la contestation.",
  }));
  if (result.error) return { error: result.error };

  revalidatePath(`/t/${tournamentId}/score`);
  return {};
}
