import { describe, it, expect } from "vitest";
import { generateRoundRobin, assignBoards, computeMatchWinner } from "./bracket";

describe("generateRoundRobin", () => {
  it("génère 6 matchs pour 4 joueurs (4×3/2 = 6)", () => {
    const matches = generateRoundRobin(["p1", "p2", "p3", "p4"]);
    expect(matches).toHaveLength(6);
  });

  it("génère 10 matchs pour 5 joueurs (avec bye)", () => {
    const matches = generateRoundRobin(["p1", "p2", "p3", "p4", "p5"]);
    expect(matches).toHaveLength(10);
  });

  it("chaque paire de joueurs se rencontre exactement une fois", () => {
    const players = ["p1", "p2", "p3", "p4"];
    const matches = generateRoundRobin(players);
    const pairs = matches.map(([a, b]) => [a, b].sort().join("-")).sort();
    const unique = new Set(pairs);
    expect(unique.size).toBe(matches.length);
  });

  it("aucun joueur ne joue contre lui-même", () => {
    const matches = generateRoundRobin(["p1", "p2", "p3", "p4"]);
    matches.forEach(([a, b]) => expect(a).not.toBe(b));
  });

  it("retourne vide pour moins de 2 joueurs", () => {
    expect(generateRoundRobin([])).toHaveLength(0);
    expect(generateRoundRobin(["p1"])).toHaveLength(0);
  });

  it("génère 1 match pour 2 joueurs", () => {
    const matches = generateRoundRobin(["p1", "p2"]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("p1");
    expect(matches[0]).toContain("p2");
  });
});

describe("assignBoards", () => {
  it("les nb_boards premiers matchs sont IN_PROGRESS", () => {
    const matches: Array<[string, string]> = [
      ["p1", "p2"], ["p3", "p4"], ["p5", "p6"], ["p1", "p3"],
    ];
    const result = assignBoards(matches, 2);
    expect(result[0].status).toBe("IN_PROGRESS");
    expect(result[1].status).toBe("IN_PROGRESS");
    expect(result[2].status).toBe("PENDING");
    expect(result[3].status).toBe("PENDING");
  });

  it("assigne les numéros de cible en rotation", () => {
    const matches: Array<[string, string]> = [
      ["p1", "p2"], ["p3", "p4"], ["p5", "p6"],
    ];
    const result = assignBoards(matches, 2);
    expect(result[0].board_number).toBe(1);
    expect(result[1].board_number).toBe(2);
    expect(result[2].board_number).toBe(1);
  });
});

describe("computeMatchWinner", () => {
  it("retourne le joueur avec le plus de sets gagnés", () => {
    const sets = [
      { winner_id: "p1" },
      { winner_id: "p2" },
      { winner_id: "p1" },
    ];
    expect(computeMatchWinner(sets, "p1", "p2")).toBe("p1");
  });

  it("retourne null en cas d'égalité", () => {
    const sets = [{ winner_id: "p1" }, { winner_id: "p2" }];
    expect(computeMatchWinner(sets, "p1", "p2")).toBeNull();
  });

  it("ignore les sets sans gagnant", () => {
    const sets = [{ winner_id: "p1" }, { winner_id: null }, { winner_id: "p1" }];
    expect(computeMatchWinner(sets, "p1", "p2")).toBe("p1");
  });
});
