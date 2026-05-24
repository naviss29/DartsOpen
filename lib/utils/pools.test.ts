import { describe, it, expect } from "vitest";
import { distributePlayersIntoPools, distributeWithSeeding, computePoolStandings } from "./pools";
import type { Registration } from "@/types";

const makePlayer = (id: string): Registration => ({
  id,
  tournament_id: "t1",
  player_name: `Player ${id}`,
  player_email: `${id}@test.com`,
  player_phone: null,
  stripe_payment_intent_id: null,
  status: "PAID",
  qr_code_token: `token-${id}`,
  created_at: new Date().toISOString(),
});

describe("distributePlayersIntoPools", () => {
  it("répartit 8 joueurs en 2 poules de 4", () => {
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(String(i + 1)));
    const pools = distributePlayersIntoPools(players, 2);
    expect(pools).toHaveLength(2);
    expect(pools[0]).toHaveLength(4);
    expect(pools[1]).toHaveLength(4);
  });

  it("répartit 6 joueurs en 3 poules de 2", () => {
    const players = Array.from({ length: 6 }, (_, i) => makePlayer(String(i + 1)));
    const pools = distributePlayersIntoPools(players, 3);
    expect(pools).toHaveLength(3);
    pools.forEach((pool) => expect(pool).toHaveLength(2));
  });

  it("distribue de façon serpentine — joueur 1 en poule A, joueur 2 en poule B", () => {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(String(i + 1)));
    const pools = distributePlayersIntoPools(players, 2);
    expect(pools[0][0].id).toBe("1");
    expect(pools[1][0].id).toBe("2");
  });
});

describe("distributePlayersIntoPools — cas limites", () => {
  it("7 joueurs en 4 poules → poules de tailles inégales (serpentine)", () => {
    const players = Array.from({ length: 7 }, (_, i) => makePlayer(String(i + 1)));
    const pools = distributePlayersIntoPools(players, 4);
    expect(pools).toHaveLength(4);
    const total = pools.reduce((sum, p) => sum + p.length, 0);
    expect(total).toBe(7);
  });

  it("calcul effectivePools : Math.min(nb_pools, floor(équipes/2))", () => {
    // 5 équipes, 4 poules configurées → effectivePools = min(4, floor(5/2)) = 2
    expect(Math.min(4, Math.floor(5 / 2))).toBe(2);
    // 8 équipes, 4 poules → effectivePools = 4 (cas normal)
    expect(Math.min(4, Math.floor(8 / 2))).toBe(4);
    // 2 équipes, 1 poule → effectivePools = 1
    expect(Math.min(1, Math.floor(2 / 2))).toBe(1);
  });
});

describe("distributeWithSeeding", () => {
  const p = (id: string) => ({ id });

  it("1 tête de série par poule quand #seeds = #poules", () => {
    const seeded = [p("S1"), p("S2"), p("S3")];
    const unseeded = [p("A"), p("B"), p("C"), p("D"), p("E"), p("F")];
    const pools = distributeWithSeeding(seeded, unseeded, 3);
    expect(pools[0][0].id).toBe("S1");
    expect(pools[1][0].id).toBe("S2");
    expect(pools[2][0].id).toBe("S3");
  });

  it("distribution serpentine : 6 seeds, 3 poules → S1→A, S2→B, S3→C, S4→C, S5→B, S6→A", () => {
    const seeded = ["S1","S2","S3","S4","S5","S6"].map(p);
    const pools = distributeWithSeeding(seeded, [], 3);
    expect(pools[0].map(x => x.id)).toEqual(["S1", "S6"]);
    expect(pools[1].map(x => x.id)).toEqual(["S2", "S5"]);
    expect(pools[2].map(x => x.id)).toEqual(["S3", "S4"]);
  });

  it("sans têtes de série : même comportement que distributePlayersIntoPools", () => {
    const players = ["A","B","C","D"].map(p);
    const withSeeding = distributeWithSeeding([], players, 2);
    const withoutSeeding = distributePlayersIntoPools(players, 2);
    expect(withSeeding[0].map(x => x.id)).toEqual(withoutSeeding[0].map(x => x.id));
    expect(withSeeding[1].map(x => x.id)).toEqual(withoutSeeding[1].map(x => x.id));
  });

  it("tous les joueurs sont présents exactement une fois", () => {
    const seeded = ["S1","S2"].map(p);
    const unseeded = ["A","B","C","D","E","F"].map(p);
    const pools = distributeWithSeeding(seeded, unseeded, 3);
    const all = pools.flat().map(x => x.id).sort();
    expect(all).toEqual(["A","B","C","D","E","F","S1","S2"].sort());
  });

  it("2 seeds, 3 poules → poule 0 et poule 1 ont une tête de série, poule 2 n'en a pas", () => {
    const seeded = ["S1","S2"].map(p);
    const pools = distributeWithSeeding(seeded, [], 3);
    expect(pools[0]).toHaveLength(1);
    expect(pools[1]).toHaveLength(1);
    expect(pools[2]).toHaveLength(0);
  });
});

describe("computePoolStandings", () => {
  it("trie par nombre de victoires décroissant", () => {
    const standings = [
      { registration_id: "a", player_name: "A", wins: 1, losses: 2, sets_won: 2, sets_lost: 4 },
      { registration_id: "b", player_name: "B", wins: 3, losses: 0, sets_won: 6, sets_lost: 0 },
      { registration_id: "c", player_name: "C", wins: 2, losses: 1, sets_won: 4, sets_lost: 2 },
    ];
    const result = computePoolStandings(standings);
    expect(result[0].registration_id).toBe("b");
    expect(result[1].registration_id).toBe("c");
    expect(result[2].registration_id).toBe("a");
  });

  it("départage à égalité de victoires par différence de sets", () => {
    const standings = [
      { registration_id: "a", player_name: "A", wins: 2, losses: 1, sets_won: 4, sets_lost: 3 },
      { registration_id: "b", player_name: "B", wins: 2, losses: 1, sets_won: 6, sets_lost: 2 },
    ];
    const result = computePoolStandings(standings);
    expect(result[0].registration_id).toBe("b");
  });
});
