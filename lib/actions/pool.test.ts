import { describe, it, expect } from "vitest";
import { distributePlayersIntoPools, distributeWithSeeding } from "@/lib/utils/pools";
import { generateRoundRobin } from "@/lib/utils/bracket";

// Simule la logique de génération des matchs de generatePools
function buildMatches(
  players: { id: string }[],
  nbPools: number,
  nbBoards: number
) {
  const effectivePools = Math.min(nbPools, Math.floor(players.length / 2));
  const poolGroups = distributePlayersIntoPools(players, effectivePools);

  const allPairings: [string, string][] = [];
  const pairingPool: number[] = [];

  poolGroups.forEach((group, poolIndex) => {
    generateRoundRobin(group.map((p) => p.id)).forEach((pair) => {
      allPairings.push(pair);
      pairingPool.push(poolIndex);
    });
  });

  return allPairings.map((pair, index) => ({
    poolIndex: pairingPool[index],
    player1Id: pair[0],
    player2Id: pair[1],
    boardNumber: index < nbBoards ? index + 1 : 0,
    status: index < nbBoards ? "IN_PROGRESS" : "PENDING",
  }));
}

describe("Génération des poules", () => {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}` }));

  it("génère le bon nombre de matchs round-robin pour 2 poules de 4", () => {
    // 2 poules × C(4,2) = 2 × 6 = 12 matchs
    const matches = buildMatches(players, 2, 2);
    expect(matches).toHaveLength(12);
  });

  it("les premiers matchs (nb_boards) démarrent EN_COURS, les autres PENDING", () => {
    const matches = buildMatches(players, 2, 2);
    const inProgress = matches.filter((m) => m.status === "IN_PROGRESS");
    const pending = matches.filter((m) => m.status === "PENDING");
    expect(inProgress).toHaveLength(2);
    expect(pending).toHaveLength(10);
  });

  it("les matchs EN_COURS ont un boardNumber > 0", () => {
    const matches = buildMatches(players, 2, 2);
    matches
      .filter((m) => m.status === "IN_PROGRESS")
      .forEach((m) => expect(m.boardNumber).toBeGreaterThan(0));
  });

  it("les matchs PENDING ont boardNumber = 0", () => {
    const matches = buildMatches(players, 2, 2);
    matches
      .filter((m) => m.status === "PENDING")
      .forEach((m) => expect(m.boardNumber).toBe(0));
  });

  it("chaque paire de joueurs n'apparaît qu'une seule fois", () => {
    const matches = buildMatches(players, 2, 2);
    const pairs = matches.map((m) =>
      [m.player1Id, m.player2Id].sort().join("-")
    );
    const unique = new Set(pairs);
    expect(unique.size).toBe(pairs.length);
  });

  it("tous les joueurs participent à au moins un match", () => {
    const matches = buildMatches(players, 2, 2);
    const involved = new Set(matches.flatMap((m) => [m.player1Id, m.player2Id]));
    players.forEach((p) => expect(involved.has(p.id)).toBe(true));
  });

  it("réduit le nombre de poules si pas assez de joueurs", () => {
    // 3 joueurs, 4 poules configurées → 1 poule effective (floor(3/2) = 1)
    const small = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const matches = buildMatches(small, 4, 2);
    const poolIndexes = new Set(matches.map((m) => m.poolIndex));
    expect(poolIndexes.size).toBe(1);
  });
});

describe("Génération avec têtes de série", () => {
  it("les têtes de série ne se retrouvent pas dans la même poule (1 seed/poule)", () => {
    const seeded = [{ id: "S1", seeded: true }, { id: "S2", seeded: true }, { id: "S3", seeded: true }];
    const unseeded = Array.from({ length: 9 }, (_, i) => ({ id: `p${i+1}`, seeded: false }));
    const pools = distributeWithSeeding(seeded, unseeded, 3);
    pools.forEach((pool, i) => {
      const seedsInPool = pool.filter(p => seeded.some(s => s.id === p.id));
      expect(seedsInPool).toHaveLength(1);
      expect(seedsInPool[0].id).toBe(seeded[i].id);
    });
  });

  it("le total de joueurs est conservé après distribution avec seeds", () => {
    const seeded = [{ id: "S1" }, { id: "S2" }];
    const unseeded = Array.from({ length: 6 }, (_, i) => ({ id: `p${i+1}` }));
    const pools = distributeWithSeeding(seeded, unseeded, 2);
    const total = pools.reduce((sum, p) => sum + p.length, 0);
    expect(total).toBe(8);
  });

  it("génère le bon nombre de matchs round-robin avec seeds", () => {
    // 2 poules de 4 (2 seeds + 6 non-seeds) → 2 × C(4,2) = 12 matchs
    const seeded = [{ id: "S1" }, { id: "S2" }];
    const unseeded = Array.from({ length: 6 }, (_, i) => ({ id: `p${i+1}` }));
    const pools = distributeWithSeeding(seeded, unseeded, 2);
    const matches = pools.flatMap((group, poolIndex) =>
      generateRoundRobin(group.map(p => p.id)).map(pair => ({ poolIndex, pair }))
    );
    expect(matches).toHaveLength(12);
  });
});

describe("Logique de nettoyage lors d'une régénération", () => {
  it("un filtre bracketRound=null identifie les matchs de poule (pas les matchs de bracket)", () => {
    // Simule des données en base : matchs de poule et matchs de bracket
    const dbMatches = [
      { id: "m1", poolId: "pool1", bracketRound: null },   // poule normale
      { id: "m2", poolId: null, bracketRound: null },      // orphelin (poolId écrasé par ON DELETE SET NULL)
      { id: "m3", poolId: null, bracketRound: 1 },         // bracket — NE DOIT PAS être supprimé
      { id: "m4", poolId: null, bracketRound: 2 },         // bracket — NE DOIT PAS être supprimé
    ];

    const toDelete = dbMatches.filter((m) => m.bracketRound === null);
    const toKeep = dbMatches.filter((m) => m.bracketRound !== null);

    expect(toDelete.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(toKeep.map((m) => m.id)).toEqual(["m3", "m4"]);
  });

  it("un filtre poolId!=null rate les matchs orphelins", () => {
    const dbMatches = [
      { id: "m1", poolId: "pool1", bracketRound: null },
      { id: "m2", poolId: null, bracketRound: null }, // orphelin manqué !
    ];

    const toDelete = dbMatches.filter((m) => m.poolId !== null);
    // Le filtre poolId!=null rate l'orphelin m2
    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].id).toBe("m1");
  });
});
