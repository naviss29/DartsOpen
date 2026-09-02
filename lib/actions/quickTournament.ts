"use server";

import { revalidatePath } from "next/cache";
import { getOwnedTournament } from "@/lib/actions/access";
import {
  dbListRegistrations,
  bulkCreateMatchesTx,
  dbDeleteQuickBracketMatchesAndRounds,
  dbResetAllLives,
  dbCreateQuickTournamentRounds,
  withTournamentLock,
  doAdvanceQuickTournamentTx,
  selectRoundId,
} from "@/lib/db/tournament";
import { shufflePlayers, pairPlayers, getQuickModeGameFormat } from "@/lib/utils/doubleElimination";
import type { BracketType } from "@/lib/generated/prisma/client";

// ── Génération du bracket ─────────────────────────────────────────────────────

/**
 * Génère le bracket initial du tournoi rapide.
 *
 * 1. Supprime les matchs et rounds précédents.
 * 2. Remet les vies à 2 pour tous les joueurs PAID.
 * 3. Crée les 3 rounds (501, Cricket, 701).
 * 4. Mélange les joueurs et crée les matchs de la manche 1 sur les cibles disponibles
 *    (bassin unique, DO-QUICK-POOL-001 — jamais un bracket winners séparé).
 *
 * En cas de nombre impair, le dernier joueur « attend » automatiquement
 * (ses adversaires arriveront au fil des matchs).
 *
 * DO-SPORT-001 (Étape 5) — les 4 étapes tournent désormais sous un seul verrou tournoi
 * (withTournamentLock) : un double-clic sur "Générer le bracket" se sérialise proprement au
 * lieu d'entrelacer suppression et recréation.
 */
export async function generateQuickBracket(tournamentId: string): Promise<{ error?: string }> {
  const tournament = await getOwnedTournament(tournamentId);
  if (!tournament.quick_mode) return { error: "Ce tournoi n'est pas en mode rapide." };

  const registrations = await dbListRegistrations(tournamentId, "PAID").catch((err) => {
    console.error("[generateQuickBracket] dbListRegistrations:", err);
    return null;
  });
  if (!registrations) return { error: "Erreur lors de la récupération des joueurs." };
  if (registrations.length < 2) return { error: "Il faut au moins 2 joueurs inscrits." };

  const playerIds = shufflePlayers(registrations.map((r) => r.id));
  const pairs = pairPlayers(playerIds);
  const totalActive = registrations.length;

  const format = getQuickModeGameFormat(totalActive);

  try {
    await withTournamentLock(tournamentId, async (tx) => {
      await dbDeleteQuickBracketMatchesAndRounds(tx, tournamentId);
      await dbResetAllLives(tx, tournamentId);

      const roundIds = await dbCreateQuickTournamentRounds(tx, tournamentId);
      const roundId = selectRoundId(roundIds, format.game_type);

      const matches: Parameters<typeof bulkCreateMatchesTx>[2] = pairs.map((pair, index) => ({
        player1Id: pair[0],
        player2Id: pair[1],
        bracketRound: 1,
        bracketPosition: index,
        boardNumber: index < tournament.nb_boards ? index + 1 : 0,
        status: index < tournament.nb_boards ? "IN_PROGRESS" : "PENDING",
        roundIds: [roundId],
        bracketType: "SINGLE" as BracketType,
      }));

      await bulkCreateMatchesTx(tx, tournamentId, matches);
    });
  } catch (err) {
    console.error("[generateQuickBracket]", err);
    return { error: "Erreur lors de la création du bracket." };
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return {};
}

// ── Avancement après chaque match ────────────────────────────────────────────

/**
 * Appelé après la finalisation d'un match en mode rapide. DO-SCORING-002 (Étape 4) — le cœur
 * (marquage, décrémentation, calcul, création, promotion, clôture éventuelle du tournoi) vit
 * désormais dans lib/db/tournament.ts::doAdvanceQuickTournamentTx(), tx-first : cette fonction
 * n'est plus qu'un ouvre-verrou, dans le même esprit que doAdvanceToNextRound() (bracket.ts).
 */
export async function doAdvanceQuickTournament(
  tournamentId: string,
  finishedMatchId: string
): Promise<{ error?: string; finished?: boolean }> {
  try {
    return await withTournamentLock(tournamentId, (tx) => doAdvanceQuickTournamentTx(tx, tournamentId, finishedMatchId));
  } catch (err) {
    console.error("[doAdvanceQuickTournament]", err);
    return { error: "Erreur lors de l'avancement du tournoi." };
  }
}
