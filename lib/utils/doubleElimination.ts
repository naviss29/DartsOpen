/**
 * Utilitaires pour le mode tournoi rapide.
 *
 * DO-QUICK-POOL-001 — bassin unique, décision Product Owner (le double élimination WB/LB/Grande
 * Finale précédent créait deux files d'appariement indépendantes : un joueur encore à 2 vies ne
 * pouvait jamais affronter un joueur à 1 vie, et une nouvelle manche losers pouvait démarrer
 * pendant que d'anciens matchs winners tournaient encore ailleurs — perçu comme un ordre de
 * passage faussé par l'organisateur). Règles :
 *   - Chaque joueur démarre avec 2 vies.
 *   - Dès qu'une cible se libère ou qu'un joueur redevient disponible, TOUS les joueurs encore en
 *     vie (1 ou 2) et non engagés dans un autre match forment un seul bassin, apparié sans tenir
 *     compte du nombre de vies restant.
 *   - Défaite → une vie perdue (2 → 1 → 0). 0 vie = éliminé.
 *   - Le tournoi se termine quand il ne reste plus qu'un joueur en vie — le dernier match joué
 *     est donc naturellement la finale, sans type de match ni traitement dédié.
 *
 * Format de jeu par phase (basé uniquement sur le nombre de joueurs encore en vie, jamais sur un
 * bracket qui n'existe plus) :
 *   - > 8 joueurs actifs  : 501 fermeture double
 *   - 5–8 joueurs actifs  : Cricket
 *   - ≤ 4 joueurs actifs  : 701 finish double
 */

/** Formats de jeu disponibles en mode rapide. */
export const QUICK_ROUND_FORMATS = {
  EARLY: { game_type: "501",     entry_type: "SINGLE", finish_type: "DOUBLE" },
  MID:   { game_type: "CRICKET", entry_type: "SINGLE", finish_type: "SINGLE" },
  LATE:  { game_type: "701",     entry_type: "SINGLE", finish_type: "DOUBLE" },
} as const;

export type QuickRoundFormat = (typeof QUICK_ROUND_FORMATS)[keyof typeof QUICK_ROUND_FORMATS];

/**
 * Détermine le format de jeu en mode rapide, uniquement en fonction du nombre de joueurs encore
 * en vie dans le tournoi (lives > 0) — jamais d'un bracket, qui n'existe plus (DO-QUICK-POOL-001).
 */
export function getQuickModeGameFormat(totalActivePlayers: number): QuickRoundFormat {
  if (totalActivePlayers <= 4) return QUICK_ROUND_FORMATS.LATE;
  if (totalActivePlayers <= 8) return QUICK_ROUND_FORMATS.MID;
  return QUICK_ROUND_FORMATS.EARLY;
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
