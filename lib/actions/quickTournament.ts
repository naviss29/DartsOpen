"use server";

import { revalidatePath } from "next/cache";
import { getOwnedTournament } from "@/lib/actions/access";
import {
  dbGetTournament,
  dbListRegistrations,
  bulkCreateMatchesTx,
  dbDeleteQuickBracketMatchesAndRounds,
  dbResetAllLives,
  dbCreateQuickTournamentRounds,
  dbGetQuickTournamentRoundIds,
  dbGetQuickTournamentState,
  dbDecrementLives,
  dbGetActiveQuickBracketMatches,
  dbPromoteUnassignedMatches,
  dbUpdateTournamentStatus,
  withTournamentLock,
} from "@/lib/db/tournament";
import {
  shufflePlayers,
  pairPlayers,
  getQuickModeGameFormat,
} from "@/lib/utils/doubleElimination";
import type { BracketType } from "@/lib/generated/prisma/client";

// ── Génération du bracket ─────────────────────────────────────────────────────

/**
 * Génère le bracket initial du tournoi rapide.
 *
 * 1. Supprime les matchs et rounds précédents.
 * 2. Remet les vies à 2 pour tous les joueurs PAID.
 * 3. Crée les 3 rounds (501, Cricket, 701).
 * 4. Mélange les joueurs et crée les matchs WB R1 sur les cibles disponibles.
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

  const format = getQuickModeGameFormat(totalActive, "WINNERS");

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
        bracketType: "WINNERS" as BracketType,
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
 * Appelé après la finalisation d'un match en mode rapide.
 *
 * Algorithme :
 * 1. Récupère le match terminé pour identifier gagnant / perdant.
 * 2. Décrémente les vies du perdant.
 * 3. Calcule les joueurs disponibles (sans match actif) par type de bracket.
 * 4. Vérifie fin de tournoi (≤ 1 joueur actif) ou Grande Finale.
 * 5. Crée les nouveaux matchs WB et LB pour les joueurs disponibles.
 * 6. Promeut les matchs PENDING vers les cibles libres.
 *
 * DO-SPORT-001 (Étape 2/3/4/5/7) — toute la séquence tourne désormais sous un seul verrou
 * tournoi (withTournamentLock), en une seule transaction : deux matchs terminés
 * "simultanément" sur deux cibles (donc deux appels concurrents de cette fonction pour le même
 * tournoi) se sérialisent — chacun relit un état de disponibilité des joueurs qui inclut déjà
 * les effets de l'autre, jamais un même joueur apparié dans deux nouveaux matchs à la fois.
 *
 * Idempotence (Étape 3, test §9 "perte de vie exactement une fois") — `Match.
 * quickAdvanceProcessedAt` est posé, sous ce même verrou, avant toute autre écriture : un rejeu
 * (retry réseau, double appel) pour le MÊME `finishedMatchId` constate l'état déjà traité et ne
 * fait rien de plus — jamais une seconde décrémentation de vie ni une seconde création de
 * matchs suivants pour ce même match.
 *
 * Toute la séquence (marquage, décrémentation, calcul, création, promotion des cibles) est
 * atomique : un échec à n'importe quelle étape annule la transaction entière plutôt que de
 * laisser un traitement partiel (perte de vie appliquée sans matchs suivants créés, etc.).
 */
export async function doAdvanceQuickTournament(
  tournamentId: string,
  finishedMatchId: string
): Promise<{ error?: string; finished?: boolean }> {
  try {
    return await withTournamentLock(tournamentId, async (tx) => {
      const tournament = await dbGetTournament(tournamentId, tx);
      if (!tournament) return { error: "Tournoi introuvable." };

      const finishedMatch = await tx.match.findUnique({
        where: { id: finishedMatchId },
        select: { player1Id: true, player2Id: true, winnerId: true, quickAdvanceProcessedAt: true },
      });
      if (!finishedMatch || !finishedMatch.winnerId) return {};
      if (finishedMatch.quickAdvanceProcessedAt !== null) return {}; // déjà traité — rejeu sans effet

      const loserId =
        finishedMatch.winnerId === finishedMatch.player1Id
          ? finishedMatch.player2Id
          : finishedMatch.player1Id;
      if (!loserId) return {};

      // Marqué avant toute autre écriture, dans la même transaction : si tout le reste échoue,
      // le rollback annule aussi ce marquage — jamais un match marqué "traité" sans l'avoir
      // réellement été.
      await tx.match.update({ where: { id: finishedMatchId }, data: { quickAdvanceProcessedAt: new Date() } });

      await dbDecrementLives(tx, loserId);

      const [allPlayers, activeMatches, roundIds] = await Promise.all([
        dbGetQuickTournamentState(tx, tournamentId),
        dbGetActiveQuickBracketMatches(tx, tournamentId),
        dbGetQuickTournamentRoundIds(tx, tournamentId),
      ]);
      if (!roundIds) return { error: "Erreur lors de la récupération de l'état du tournoi." };

      const activePlayers = allPlayers.filter((p) => p.lives > 0);
      const totalActive = activePlayers.length;

      // Joueurs actuellement dans un match actif
      const inMatchIds = new Set<string>(
        activeMatches.flatMap((m) => [m.player1_id, m.player2_id].filter(Boolean) as string[])
      );

      // Joueurs disponibles par bracket
      const availableWB = activePlayers.filter((p) => p.lives === 2 && !inMatchIds.has(p.id));
      const availableLB = activePlayers.filter((p) => p.lives === 1 && !inMatchIds.has(p.id));

      // ── Fin de tournoi ─────────────────────────────────────────────────────────
      if (totalActive <= 1 && activeMatches.length === 0) {
        return { outcome: "FINISHED" as const };
      }

      // ── Grande Finale ─────────────────────────────────────────────────────────
      // Condition : exactement 1 WB + 1 LB disponibles, aucun autre match actif
      if (
        availableWB.length === 1 &&
        availableLB.length === 1 &&
        totalActive === 2 &&
        activeMatches.length === 0
      ) {
        const maxGFRound = await tx.match.aggregate({
          where: { tournamentId, bracketType: "GRAND_FINAL" },
          _max: { bracketRound: true },
        });
        const gfRound = (maxGFRound._max.bracketRound ?? 0) + 1;
        const format = getQuickModeGameFormat(totalActive, "GRAND_FINAL");
        const roundId = selectRoundId(roundIds, format.game_type);

        await bulkCreateMatchesTx(tx, tournamentId, [{
          player1Id: availableWB[0].id,
          player2Id: availableLB[0].id,
          bracketRound: gfRound,
          bracketPosition: 0,
          boardNumber: 0,
          status: "PENDING",
          roundIds: [roundId],
          bracketType: "GRAND_FINAL" as BracketType,
        }]);

        await dbPromoteUnassignedMatches(tx, tournamentId, tournament.nb_boards);
        return {};
      }

      // ── Nouveaux matchs WB ────────────────────────────────────────────────────
      const newMatches: Parameters<typeof bulkCreateMatchesTx>[2] = [];

      if (availableWB.length >= 2) {
        const wbPairs = pairPlayers(availableWB.map((p) => p.id));
        const maxWBRound = await tx.match.aggregate({
          where: { tournamentId, bracketType: "WINNERS" },
          _max: { bracketRound: true },
        });
        const nextWBRound = (maxWBRound._max.bracketRound ?? 0) + 1;
        const wbFormat = getQuickModeGameFormat(totalActive, "WINNERS");
        const wbRoundId = selectRoundId(roundIds, wbFormat.game_type);

        wbPairs.forEach((pair, i) => {
          newMatches.push({
            player1Id: pair[0],
            player2Id: pair[1],
            bracketRound: nextWBRound,
            bracketPosition: i,
            boardNumber: 0,
            status: "PENDING",
            roundIds: [wbRoundId],
            bracketType: "WINNERS" as BracketType,
          });
        });
      }

      // ── Nouveaux matchs LB ────────────────────────────────────────────────────
      if (availableLB.length >= 2) {
        const lbPairs = pairPlayers(availableLB.map((p) => p.id));
        const maxLBRound = await tx.match.aggregate({
          where: { tournamentId, bracketType: "LOSERS" },
          _max: { bracketRound: true },
        });
        const nextLBRound = (maxLBRound._max.bracketRound ?? 0) + 1;
        const lbFormat = getQuickModeGameFormat(totalActive, "LOSERS");
        const lbRoundId = selectRoundId(roundIds, lbFormat.game_type);

        lbPairs.forEach((pair, i) => {
          newMatches.push({
            player1Id: pair[0],
            player2Id: pair[1],
            bracketRound: nextLBRound,
            bracketPosition: i,
            boardNumber: 0,
            status: "PENDING",
            roundIds: [lbRoundId],
            bracketType: "LOSERS" as BracketType,
          });
        });
      }

      if (newMatches.length > 0) {
        await bulkCreateMatchesTx(tx, tournamentId, newMatches);
      }

      // Promouvoir les matchs en attente vers les cibles libres
      await dbPromoteUnassignedMatches(tx, tournamentId, tournament.nb_boards);

      return {};
    }).then(async (result) => {
      if (result && "outcome" in result && result.outcome === "FINISHED") {
        await dbUpdateTournamentStatus(tournamentId, "FINISHED").catch((err) =>
          console.warn("[doAdvanceQuickTournament] updateStatus FINISHED:", err)
        );
        return { finished: true };
      }
      return result as { error?: string };
    });
  } catch (err) {
    console.error("[doAdvanceQuickTournament]", err);
    return { error: "Erreur lors de l'avancement du tournoi." };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sélectionne l'ID du round correspondant au format de jeu demandé.
 * Utilise 501 comme fallback si le format n'est pas reconnu.
 */
function selectRoundId(
  roundIds: { id501: string; idCricket: string; id701: string },
  gameType: string
): string {
  if (gameType === "CRICKET") return roundIds.idCricket;
  if (gameType === "701") return roundIds.id701;
  return roundIds.id501;
}
