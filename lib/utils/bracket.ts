/**
 * Génère les matchs round-robin pour une liste de joueurs.
 * Algorithme : rotation de Berger (premier joueur fixe).
 * Pour N joueurs → N*(N-1)/2 matchs.
 */
export function generateRoundRobin(playerIds: string[]): Array<[string, string]> {
  const matches: Array<[string, string]> = [];
  const p = [...playerIds];

  if (p.length % 2 !== 0) p.push("bye");

  const n = p.length;

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = p[i];
      const away = p[n - 1 - i];
      if (home !== "bye" && away !== "bye") {
        matches.push([home, away]);
      }
    }
    // Rotation : le premier reste fixe, les autres tournent
    const last = p.pop()!;
    p.splice(1, 0, last);
  }

  return matches;
}

/**
 * Assigne les numéros de cible aux matchs.
 * Les nb_boards premiers matchs sont IN_PROGRESS, les suivants PENDING.
 */
export function assignBoards(
  matches: Array<[string, string]>,
  nbBoards: number
): Array<{ player1_id: string; player2_id: string; board_number: number; status: "IN_PROGRESS" | "PENDING" }> {
  return matches.map((match, index) => ({
    player1_id: match[0],
    player2_id: match[1],
    board_number: (index % nbBoards) + 1,
    status: index < nbBoards ? "IN_PROGRESS" : "PENDING",
  }));
}

/**
 * Détermine le gagnant d'un match à partir des sets gagnés.
 * En cas d'égalité retourne null (à gérer par l'organisateur).
 */
export function computeMatchWinner(
  sets: Array<{ winner_id: string | null }>,
  player1Id: string,
  player2Id: string
): string | null {
  const p1wins = sets.filter((s) => s.winner_id === player1Id).length;
  const p2wins = sets.filter((s) => s.winner_id === player2Id).length;
  if (p1wins > p2wins) return player1Id;
  if (p2wins > p1wins) return player2Id;
  return null;
}
