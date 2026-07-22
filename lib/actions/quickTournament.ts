"use server";

import { revalidatePath } from "next/cache";
import { getOwnedTournament } from "@/lib/actions/access";
import {
  dbGetTournament,
  dbListRegistrations,
  dbBulkCreateMatches,
  dbDeleteQuickBracketMatchesAndRounds,
  dbResetAllLives,
  dbCreateQuickTournamentRounds,
  dbGetQuickTournamentRoundIds,
  dbGetQuickTournamentState,
  dbDecrementLives,
  dbGetActiveQuickBracketMatches,
  dbPromoteUnassignedMatches,
  dbUpdateTournamentStatus,
} from "@/lib/db/tournament";
import { prisma } from "@/lib/db/client";
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

  // Supprimer bracket + rounds précédents, remettre les vies à 2
  try {
    await dbDeleteQuickBracketMatchesAndRounds(tournamentId);
    await dbResetAllLives(tournamentId);
  } catch (err) {
    console.error("[generateQuickBracket] reset:", err);
    return { error: "Erreur lors de la réinitialisation du bracket." };
  }

  const roundIds = await dbCreateQuickTournamentRounds(tournamentId).catch((err) => {
    console.error("[generateQuickBracket] dbCreateQuickTournamentRounds:", err);
    return null;
  });
  if (!roundIds) return { error: "Erreur lors de la création des rounds." };

  const playerIds = shufflePlayers(registrations.map((r) => r.id));
  const pairs = pairPlayers(playerIds);
  const totalActive = registrations.length;

  const format = getQuickModeGameFormat(totalActive, "WINNERS");
  const roundId = selectRoundId(roundIds, format.game_type);

  const matches: Parameters<typeof dbBulkCreateMatches>[1] = pairs.map((pair, index) => ({
    player1Id: pair[0],
    player2Id: pair[1],
    bracketRound: 1,
    bracketPosition: index,
    boardNumber: index < tournament.nb_boards ? index + 1 : 0,
    status: index < tournament.nb_boards ? "IN_PROGRESS" : "PENDING",
    roundIds: [roundId],
    bracketType: "WINNERS" as BracketType,
  }));

  const ok = await dbBulkCreateMatches(tournamentId, matches).catch((err) => {
    console.error("[generateQuickBracket] dbBulkCreateMatches:", err);
    return false;
  });
  if (ok === false) return { error: "Erreur lors de la création des matchs." };

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
 */
export async function doAdvanceQuickTournament(
  tournamentId: string,
  finishedMatchId: string
): Promise<{ error?: string; finished?: boolean }> {
  const tournament = await dbGetTournament(tournamentId).catch((err) => {
    console.error("[doAdvanceQuickTournament] dbGetTournament:", err);
    return null;
  });
  if (!tournament) return { error: "Tournoi introuvable." };

  // Récupérer le match terminé (winner + loser)
  const finishedMatch = await prisma.match.findUnique({
    where: { id: finishedMatchId },
    select: { player1Id: true, player2Id: true, winnerId: true, bracketType: true },
  }).catch((err) => {
    console.error("[doAdvanceQuickTournament] findMatch:", err);
    return null;
  });
  if (!finishedMatch || !finishedMatch.winnerId) return {};

  const loserId =
    finishedMatch.winnerId === finishedMatch.player1Id
      ? finishedMatch.player2Id
      : finishedMatch.player1Id;

  if (!loserId) return {};

  // Décrémenter les vies du perdant
  const newLives = await dbDecrementLives(loserId).catch((err) => {
    console.error("[doAdvanceQuickTournament] dbDecrementLives:", err);
    return null;
  });
  if (newLives === null) return { error: "Erreur lors de la mise à jour des vies." };

  // État complet du tournoi
  const [allPlayers, activeMatches, roundIds] = await Promise.all([
    dbGetQuickTournamentState(tournamentId),
    dbGetActiveQuickBracketMatches(tournamentId),
    dbGetQuickTournamentRoundIds(tournamentId),
  ]).catch((err) => {
    console.error("[doAdvanceQuickTournament] state fetch:", err);
    return [null, null, null] as const;
  });

  if (!allPlayers || !activeMatches || !roundIds) {
    return { error: "Erreur lors de la récupération de l'état du tournoi." };
  }

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
    await dbUpdateTournamentStatus(tournamentId, "FINISHED").catch((err) =>
      console.warn("[doAdvanceQuickTournament] updateStatus FINISHED:", err)
    );
    return { finished: true };
  }

  // ── Grande Finale ─────────────────────────────────────────────────────────
  // Condition : exactement 1 WB + 1 LB disponibles, aucun autre match actif
  if (
    availableWB.length === 1 &&
    availableLB.length === 1 &&
    totalActive === 2 &&
    activeMatches.length === 0
  ) {
    const maxGFRound = await prisma.match.aggregate({
      where: { tournamentId, bracketType: "GRAND_FINAL" },
      _max: { bracketRound: true },
    });
    const gfRound = (maxGFRound._max.bracketRound ?? 0) + 1;
    const format = getQuickModeGameFormat(totalActive, "GRAND_FINAL");
    const roundId = selectRoundId(roundIds, format.game_type);

    const ok = await dbBulkCreateMatches(tournamentId, [{
      player1Id: availableWB[0].id,
      player2Id: availableLB[0].id,
      bracketRound: gfRound,
      bracketPosition: 0,
      boardNumber: 0,
      status: "PENDING",
      roundIds: [roundId],
      bracketType: "GRAND_FINAL" as BracketType,
    }]).catch((err) => {
      console.error("[doAdvanceQuickTournament] create GRAND_FINAL:", err);
      return false;
    });
    if (ok === false) return { error: "Erreur lors de la création de la Grande Finale." };

    await dbPromoteUnassignedMatches(tournamentId, tournament.nb_boards).catch((err) =>
      console.warn("[doAdvanceQuickTournament] promoteGF:", err)
    );
    return {};
  }

  // ── Nouveaux matchs WB ────────────────────────────────────────────────────
  const newMatches: Parameters<typeof dbBulkCreateMatches>[1] = [];

  if (availableWB.length >= 2) {
    const wbPairs = pairPlayers(availableWB.map((p) => p.id));
    const maxWBRound = await prisma.match.aggregate({
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
    const maxLBRound = await prisma.match.aggregate({
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
    const ok = await dbBulkCreateMatches(tournamentId, newMatches).catch((err) => {
      console.error("[doAdvanceQuickTournament] dbBulkCreateMatches:", err);
      return false;
    });
    if (ok === false) return { error: "Erreur lors de la création des matchs suivants." };
  }

  // Promouvoir les matchs en attente vers les cibles libres
  await dbPromoteUnassignedMatches(tournamentId, tournament.nb_boards).catch((err) =>
    console.warn("[doAdvanceQuickTournament] promote:", err)
  );

  return {};
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
