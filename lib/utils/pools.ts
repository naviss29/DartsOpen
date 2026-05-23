/**
 * Répartit les joueurs en N poules équilibrées (distribution serpentine).
 * Exemple 8 joueurs, 2 poules → Poule A: 1,3,5,7 / Poule B: 2,4,6,8
 */
export function distributePlayersIntoPools<T extends { id: string }>(
  players: T[],
  nbPools: number
): T[][] {
  const pools: T[][] = Array.from({ length: nbPools }, () => []);
  players.forEach((player, index) => {
    pools[index % nbPools].push(player);
  });
  return pools;
}

/**
 * Distribue les joueurs en tenant compte des têtes de série.
 * Les têtes de série sont placées en serpentin (une par poule en alternance).
 * Les autres joueurs remplissent les places restantes aléatoirement.
 *
 * Exemple avec 3 poules et 4 têtes de série [S1,S2,S3,S4] :
 *   Tour 1 (→) : S1→A, S2→B, S3→C
 *   Tour 2 (←) : S4→C
 *   Résultat : A=[S1,…], B=[S2,…], C=[S3,S4,…]
 */
export function distributeWithSeeding<T extends { id: string }>(
  seeded: T[],
  unseeded: T[],
  nbPools: number
): T[][] {
  const pools: T[][] = Array.from({ length: nbPools }, () => []);

  seeded.forEach((player, i) => {
    const round = Math.floor(i / nbPools);
    const pos = i % nbPools;
    const poolIndex = round % 2 === 0 ? pos : nbPools - 1 - pos;
    pools[poolIndex].push(player);
  });

  unseeded.forEach((player, i) => {
    pools[i % nbPools].push(player);
  });

  return pools;
}

export interface PoolStanding {
  registration_id: string;
  player_name: string;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
}

/**
 * Trie les joueurs d'une poule par classement.
 * Critère 1 : nombre de victoires (descendant).
 * Critère 2 (départage) : différentiel sets gagnés/perdus (descendant).
 */
export function computePoolStandings(
  players: PoolStanding[]
): PoolStanding[] {
  return [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aDiff = a.sets_won - a.sets_lost;
    const bDiff = b.sets_won - b.sets_lost;
    return bDiff - aDiff;
  });
}
