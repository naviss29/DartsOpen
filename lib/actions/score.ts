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
import { loadMatchSetChain, resolveAuthorizedSide, isValidMatchPlayer } from "@/lib/actions/scoreAuthorization";
import { authorizeScoring, verifyFieldSession, canMarkWinnerDirect } from "@/lib/actions/fieldAccess";

/**
 * DO-FIELD-ACCESS-001 — deux voies d'autorisation, jamais une troisième "de confort" :
 * 1. compte SterPlatform authentifié dont l'e-mail correspond à un côté du match
 *    (resolveAuthorizedSide, comportement inchangé — non-régression pour les joueurs qui ont
 *    déjà un compte) ;
 * 2. accès terrain temporaire valide pour CE match (QR de cible scanné), sans compte requis —
 *    "participant de tournoi ≠ utilisateur SterPlatform". Une session terrain valide autorise
 *    n'importe quel côté déclaré par le client (jamais vérifié par e-mail dans ce cas, mais
 *    toujours vérifié comme un joueur RÉEL de ce match via isValidMatchPlayer) : le même modèle
 *    de confiance "appareil partagé à la cible" que la saisie traditionnelle X01.
 * Aucune des deux ne donne accès à quoi que ce soit d'organisateur.
 */
async function authorizeElectronicSide(
  chain: Awaited<ReturnType<typeof loadMatchSetChain>>,
  tournamentId: string,
  playerSide: 1 | 2,
): Promise<{ error?: string }> {
  if (!chain) return { error: "Set introuvable." };

  const user = await getUser();
  if (user) {
    const authorizedSide = resolveAuthorizedSide(user, chain);
    if (authorizedSide === playerSide) return {};
  }

  const field = await verifyFieldSession(tournamentId, chain.match.id);
  if (field.ok) return {};

  return { error: "Vous ne participez pas à ce match. Scannez le QR code de la cible ou connectez-vous." };
}

export async function proposeWinner(
  matchSetId: string,
  winnerId: string,
  playerSide: 1 | 2,
  tournamentId: string
): Promise<{ error?: string }> {
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const auth = await authorizeElectronicSide(chain, tournamentId, playerSide);
  if (auth.error) return auth;
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
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const auth = await authorizeElectronicSide(chain, tournamentId, playerSide);
  if (auth.error) return auth;

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

/**
 * DO-FIELD-ACCESS-001 — organisateur (inchangé) OU accès terrain, mais jamais pour le même
 * usage : `markWinnerDirect` sert à la fois la désignation Cricket normale (autorisée en accès
 * terrain PLAYER, seule voie de saisie existante pour ce mode) et le raccourci "désigner
 * manuellement le gagnant" du X01 (une correction, jamais la saisie normale — réservée à
 * l'organisateur et à un accès terrain REFEREE, voir canMarkWinnerDirect()).
 */
export async function markWinnerDirect(
  matchSetId: string,
  winnerId: string,
  tournamentId: string
): Promise<{ error?: string }> {
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };
  if (!isValidMatchPlayer(chain, winnerId)) return { error: "Joueur invalide pour ce match." };

  const access = await authorizeScoring(tournamentId, chain.match.id);
  if (!access.ok) return { error: access.error };
  if (!canMarkWinnerDirect(access, chain.gameType)) {
    return { error: "Cette action nécessite un accès organisateur ou arbitre." };
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

/**
 * DO-SCORING-001/002, autorisation revue par DO-FIELD-ACCESS-001 — enregistre une volée X01 en
 * mode traditionnel. Organisateur (`getOwnedTournament`, inchangé) OU accès terrain valide pour
 * CE match (QR de cible scanné, sans compte SterPlatform requis) : la saisie traditionnelle se
 * fait sur l'appareil partagé posé à la cible, potentiellement tenu par un joueur ou un
 * marqueur bénévole plutôt que par l'organisateur en personne (voir le mode ÉLECTRONIQUE pour
 * la saisie individuelle par chaque joueur).
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
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const access = await authorizeScoring(tournamentId, chain.match.id);
  if (!access.ok) return { error: access.error };

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
 * DO-SCORING-001 (Étape 6), autorisation revue par DO-FIELD-ACCESS-001 — annule uniquement la
 * dernière volée applicable de cette manche. Organisateur OU accès terrain valide pour CE match
 * (autorisation contrôlée par authorizeScoring, comme recordThrow) : un joueur/marqueur terrain
 * peut corriger immédiatement une erreur de saisie sans droit organisateur — toutes les
 * protections serveur DO-SCORING restent intactes et inchangées (dbCancelLastThrow refuse
 * proprement si la conséquence sportive de cette volée a déjà été propagée hors de la saisie
 * X01, ou si une manche suivante a commencé — voir son docblock), sans jamais tenter de
 * reconstruire le tournoi.
 */
export async function cancelLastThrow(
  matchSetId: string,
  tournamentId: string,
  cancelRequestId: string
): Promise<{ error?: string }> {
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const access = await authorizeScoring(tournamentId, chain.match.id);
  if (!access.ok) return { error: access.error };

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
  const chain = await loadMatchSetChain(matchSetId, tournamentId);
  if (!chain) return { error: "Set introuvable." };

  const user = await getUser();
  const authorizedSide = user ? resolveAuthorizedSide(user, chain) : null;
  if (authorizedSide === null) {
    const field = await verifyFieldSession(tournamentId, chain.match.id);
    if (!field.ok) return { error: "Vous ne participez pas à ce match. Scannez le QR code de la cible ou connectez-vous." };
  }

  const result = await dbDisputeResult(matchSetId).catch(() => ({
    error: "Erreur lors de la contestation.",
  }));
  if (result.error) return { error: result.error };

  revalidatePath(`/t/${tournamentId}/score`);
  return {};
}
