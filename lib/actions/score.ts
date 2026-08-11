"use server";

import { revalidatePath } from "next/cache";
import {
  dbProposeWinner,
  dbConfirmWinner,
  dbDisputeResult,
  dbMarkWinnerDirect,
} from "@/lib/db/tournament";
import { doAdvanceToNextRound } from "@/lib/actions/bracket";
import { doAdvanceQuickTournament } from "@/lib/actions/quickTournament";
import { publishMatchUpdate } from "@/lib/mercure";
import { getUser } from "@/lib/api/auth";
import { getOwnedTournament } from "@/lib/actions/access";
import { loadMatchSetChain, resolveAuthorizedSide, isValidMatchPlayer } from "@/lib/actions/scoreAuthorization";

export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié." };

  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const authorizedSide = resolveAuthorizedSide(user, chain);
  if (authorizedSide === null) return { error: "Vous ne participez pas à ce match." };
  if (authorizedSide !== playerSide) return { error: "Cette action ne correspond pas à votre identité de joueur." };
  if (!isValidMatchPlayer(chain, winnerId)) return { error: "Joueur invalide pour ce match." };

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

  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const authorizedSide = resolveAuthorizedSide(user, chain);
  if (authorizedSide === null) return { error: "Vous ne participez pas à ce match." };
  if (authorizedSide !== playerSide) return { error: "Cette action ne correspond pas à votre identité de joueur." };

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
  await getOwnedTournament(tournamentId);

  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };
  if (!isValidMatchPlayer(chain, winnerId)) return { error: "Joueur invalide pour ce match." };

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

  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const authorizedSide = resolveAuthorizedSide(user, chain);
  if (authorizedSide === null) return { error: "Vous ne participez pas à ce match." };

  const result = await dbDisputeResult(matchSetId).catch(() => ({
    error: "Erreur lors de la contestation.",
  }));
  if (result.error) return { error: result.error };

  revalidatePath(`/t/${tournamentId}/score`);
  return {};
}
