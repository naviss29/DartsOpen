/**
 * Utilitaires pour le mode tournoi rapide (double élimination).
 *
 * Règles du mode rapide :
 *   - Chaque joueur démarre avec 2 vies.
 *   - Défaite dans le bracket winners (WB) → 1 vie restante → passage en bracket losers (LB).
 *   - Défaite dans le bracket losers  (LB) → 0 vie → éliminé.
 *   - Quand il reste exactement 1 joueur WB (vies=2) + 1 joueur LB (vies=1) sans autre match actif :
 *     Grande Finale.
 *
 * Format de jeu par phase (basé sur le nombre de joueurs encore en vie) :
 *   - > 8 joueurs actifs  : 501 fermeture double (WB) / Cricket (LB)
 *   - 5–8 joueurs actifs  : Cricket (huitièmes / quarts de finale)
 *   - ≤ 4 joueurs actifs  : 701 finish double (demi-finales / finale)
 *   - Grande Finale       : 701 finish double
 */

export type QuickBracketType = "WINNERS" | "LOSERS" | "GRAND_FINAL";

/** Formats de jeu disponibles en mode rapide. */
export const QUICK_ROUND_FORMATS = {
  EARLY: { game_type: "501",     entry_type: "SINGLE", finish_type: "DOUBLE" },
  MID:   { game_type: "CRICKET", entry_type: "SINGLE", finish_type: "SINGLE" },
  LATE:  { game_type: "701",     entry_type: "SINGLE", finish_type: "DOUBLE" },
} as const;

export type QuickRoundFormat = (typeof QUICK_ROUND_FORMATS)[keyof typeof QUICK_ROUND_FORMATS];

/**
 * Détermine le format de jeu d'un match en mode rapide.
 *
 * @param totalActivePlayers Joueurs encore en vie dans le tournoi (lives > 0).
 * @param bracketType        Type de bracket du match (WB, LB, Grande Finale).
 */
export function getQuickModeGameFormat(
  totalActivePlayers: number,
  bracketType: QuickBracketType
): QuickRoundFormat {
  if (bracketType === "GRAND_FINAL") return QUICK_ROUND_FORMATS.LATE;
  if (totalActivePlayers <= 4) return QUICK_ROUND_FORMATS.LATE;
  if (totalActivePlayers <= 8) return QUICK_ROUND_FORMATS.MID;
  // > 8 joueurs : LB toujours Cricket, WB commence en 501
  return bracketType === "LOSERS" ? QUICK_ROUND_FORMATS.MID : QUICK_ROUND_FORMATS.EARLY;
}

/**
 * Apparie des joueurs deux par deux dans l'ordre donné.
 * Si le nombre est impair, le dernier joueur attend (sera apparié au prochain tour).
 *
 * @param playerIds Liste d'identifiants de joueurs.
 * @returns Tableau de paires [player1Id, player2Id].
 */
export function pairPlayers(playerIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < playerIds.length; i += 2) {
    pairs.push([playerIds[i], playerIds[i + 1]]);
  }
  return pairs;
}

/**
 * Mélange un tableau aléatoirement (algorithme Fisher-Yates).
 * Retourne une copie — le tableau original n'est pas modifié.
 *
 * @param arr Tableau à mélanger.
 */
export function shufflePlayers<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
