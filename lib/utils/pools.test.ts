import { describe, it, expect } from "vitest";
import { distributePlayersIntoPools, computePoolStandings } from "./pools";
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
