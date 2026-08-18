"use server";

import { revalidatePath } from "next/cache";
import {
  dbProposeWinner,
  dbConfirmWinner,
  dbDisputeResult,
  dbMarkWinnerDirect,
  dbRecordThrow,
  dbCancelLastThrow,
} from "@/lib/db/tournament";
import type { CheckoutDart } from "@/lib/utils/x01";
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

/**
 * DO-SCORING-001/002 — enregistre une volée X01 en mode traditionnel. Même modèle d'autorisation
 * que markWinnerDirect() (organisateur uniquement, `getOwnedTournament`) : la saisie
 * traditionnelle se fait sur l'appareil de l'organisateur/marqueur, jamais par les joueurs
 * eux-mêmes (voir le mode ÉLECTRONIQUE pour la saisie publique par les joueurs).
 *
 * `clientRequestId` doit être généré une seule fois côté client par volée (pas régénéré à
 * chaque tentative) pour que le double-clic/retry réseau soit absorbé côté serveur — voir
 * dbRecordThrow(). `checkoutDart` (segment + multiplicateur de la fléchette de fermeture)
 * n'est utile que lorsque cette volée atteint exactement zéro ; le serveur seul décide si le
 * checkout est valide (DO-SCORING-002 Étape 5). Le serveur ne fait jamais confiance à
 * `player`/`scoreEntered`/`checkoutDart` au-delà de la saisie brute : la conséquence (bust,
 * restant, fin de manche, fin de match, progression DO-SPORT) est entièrement recalculée et
 * appliquée par dbRecordThrow(), dans UNE SEULE transaction — DO-SCORING-002 (Étape 4) a
 * supprimé l'appel séparé à doAdvanceToNextRound()/doAdvanceQuickTournament() qui existait ici
 * depuis DO-SCORING-001 : la progression sportive fait désormais partie de cette même
 * transaction, jamais un second verrou après coup dont l'échec pourrait être absorbé.
 */
export async function recordThrow(
  matchSetId: string,
  tournamentId: string,
  player: 1 | 2,
  scoreEntered: number,
  clientRequestId: string,
  checkoutDart?: CheckoutDart | null
): Promise<{ error?: string; bust?: boolean; reason?: string | null; impossibleCheckout?: boolean }> {
  await getOwnedTournament(tournamentId);

  const result = await dbRecordThrow(matchSetId, tournamentId, player, scoreEntered, clientRequestId, checkoutDart).catch(
    () => ({ error: "Erreur lors de l'enregistrement de la volée." })
  );
  if ("error" in result) return { error: result.error };

  if (result.matchFinished) {
    publishMatchUpdate(tournamentId).catch(() => {});
  }

  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return { bust: result.bust, reason: result.reason, impossibleCheckout: result.impossibleCheckout };
}

/**
 * DO-SCORING-001 (Étape 6) — annule uniquement la dernière volée applicable de cette manche.
 * Décidée entièrement côté serveur (dbCancelLastThrow) : refuse proprement si la conséquence
 * sportive de cette volée a déjà été propagée hors de la saisie X01 (voir son docblock), sans
 * jamais tenter de reconstruire le tournoi.
 */
export async function cancelLastThrow(
  matchSetId: string,
  tournamentId: string,
  cancelRequestId: string
): Promise<{ error?: string }> {
  await getOwnedTournament(tournamentId);

  const result = await dbCancelLastThrow(matchSetId, tournamentId, cancelRequestId).catch(
    (): Awaited<ReturnType<typeof dbCancelLastThrow>> => ({ error: "Erreur lors de l'annulation de la volée." })
  );
  if (result.error) return { error: result.error };

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
