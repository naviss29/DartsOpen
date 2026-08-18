"use server";

import { seedBracket } from "@/lib/utils/bracket";
import { getOwnedTournament } from "@/lib/actions/access";
import {
  dbBulkCreateMatches,
  bulkCreateMatchesTx,
  dbDeleteBracketMatches,
  withTournamentLock,
  getAdvancingPlayerIds,
  doAdvanceToNextRoundTx,
} from "@/lib/db/tournament";

/**
 * DO-SPORT-001 (Étape 5) — verrouillée sur le tournoi : un double-clic organisateur sur
 * "Générer les phases finales" se sérialise (supprime puis recrée) au lieu de s'entrelacer.
 * La contrainte partielle `matches_unique_bracket_slot` (migration DO-SPORT-001) reste un
 * filet de sécurité DB si ce raisonnement applicatif avait un trou.
 */
export async function generateBracket(tournamentId: string): Promise<{ error?: string }> {
  const tournament = await getOwnedTournament(tournamentId);

  const advancingPlayers = await getAdvancingPlayerIds(tournamentId, tournament);

  if (advancingPlayers.length < 2) {
    return { error: "Pas assez de joueurs inscrits pour générer les phases finales." };
  }

  const pairs = seedBracket(advancingPlayers);
  const rounds = [...tournament.rounds].sort((a, b) => a.order - b.order);

  let boardCounter = 1;
  const matches: Parameters<typeof dbBulkCreateMatches>[1] = [];

  for (const pair of pairs) {
    if (pair.player1_id === null || pair.player2_id === null) {
      // Joueurs avec bye : passent directement au tour suivant, pas de match R1
      continue;
    }

    const boardNum = ((boardCounter - 1) % tournament.nb_boards) + 1;
    const isFirst = boardCounter <= tournament.nb_boards;
    boardCounter++;

    matches.push({
      player1Id: pair.player1_id,
      player2Id: pair.player2_id,
      bracketRound: 1,
      bracketPosition: pair.bracket_position,
      // DO-SPORT-002 — un match PENDING n'a jamais de cible préaffectée (voir le modèle déjà
      // correct du tournoi rapide) : seul un match qui démarre réellement IN_PROGRESS reçoit un
      // boardNumber réel, jamais un numéro cyclique "réservé" pour un match encore en attente.
      boardNumber: isFirst ? boardNum : 0,
      status: isFirst ? "IN_PROGRESS" : "PENDING",
      roundIds: rounds.map((r) => r.id),
    });
  }

  try {
    await withTournamentLock(tournamentId, async (tx) => {
      await dbDeleteBracketMatches(tournamentId, tx);
      await bulkCreateMatchesTx(tx, tournamentId, matches);
    });
  } catch {
    return { error: "Erreur lors de la création des phases finales." };
  }

  return {};
}

export async function advanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  await getOwnedTournament(tournamentId);

  return doAdvanceToNextRound(tournamentId, currentBracketRound);
}

/**
 * DO-SPORT-001 (Étape 2/4/5) — décision et écriture sous le verrou tournoi. DO-SCORING-002
 * (Étape 4) — le cœur (décision + création du tour suivant + clôture éventuelle du tournoi)
 * vit désormais dans lib/db/tournament.ts::doAdvanceToNextRoundTx(), tx-first : cette fonction
 * n'est plus qu'un ouvre-verrou. dbRecordThrow() (saisie X01) appelle directement le cœur avec
 * SON PROPRE tx quand un checkout vient de finaliser un match — même conséquence sportive,
 * même frontière transactionnelle que la volée elle-même.
 */
export async function doAdvanceToNextRound(
  tournamentId: string,
  currentBracketRound: number
): Promise<{ error?: string; finished?: boolean }> {
  return withTournamentLock(tournamentId, (tx) => doAdvanceToNextRoundTx(tx, tournamentId, currentBracketRound));
}
