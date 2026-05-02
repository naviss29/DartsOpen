import type { Registration } from "@/types";

/**
 * Répartit les joueurs en N poules équilibrées (distribution serpentine).
 * Exemple 8 joueurs, 2 poules → Poule A: 1,3,5,7 / Poule B: 2,4,6,8
 */
export function distributePlayersIntoPools(
  players: Registration[],
  nbPools: number
): Registration[][] {
  const pools: Registration[][] = Array.from({ length: nbPools }, () => []);
  players.forEach((player, index) => {
    pools[index % nbPools].push(player);
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
