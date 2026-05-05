import { describe, it, expect } from "vitest";
import { generateRoundRobin, assignBoards, computeMatchWinner, seedBracket, roundLabel, computeTotalRounds } from "./bracket";

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

describe("seedBracket", () => {
  it("génère 2 paires pour 4 joueurs sans bye", () => {
    const pairs = seedBracket(["p1", "p2", "p3", "p4"]);
    expect(pairs).toHaveLength(2);
    expect(pairs.every(p => p.player2_id !== null)).toBe(true);
  });

  it("génère 4 paires pour 8 joueurs sans bye", () => {
    const pairs = seedBracket(["p1","p2","p3","p4","p5","p6","p7","p8"]);
    expect(pairs).toHaveLength(4);
    expect(pairs.every(p => p.player2_id !== null)).toBe(true);
  });

  it("padde avec des byes pour 6 joueurs → 4 paires, 2 byes", () => {
    const pairs = seedBracket(["p1","p2","p3","p4","p5","p6"]);
    expect(pairs).toHaveLength(4);
    const byePairs = pairs.filter(p => p.player2_id === null);
    expect(byePairs).toHaveLength(2);
  });

  it("les têtes de série les plus hautes reçoivent les byes", () => {
    const pairs = seedBracket(["p1","p2","p3","p4","p5","p6"]);
    const byePairs = pairs.filter(p => p.player2_id === null);
    const byePlayers = byePairs.map(p => p.player1_id);
    expect(byePlayers).toContain("p1");
    expect(byePlayers).toContain("p2");
  });

  it("apparie tête de série 1 vs dernière place", () => {
    const pairs = seedBracket(["p1","p2","p3","p4"]);
    const first = pairs.find(p => p.bracket_position === 0);
    expect(first?.player1_id).toBe("p1");
    expect(first?.player2_id).toBe("p4");
  });

  it("retourne vide pour moins de 2 joueurs", () => {
    expect(seedBracket([])).toHaveLength(0);
    expect(seedBracket(["p1"])).toHaveLength(0);
  });

  it("les positions bracket sont continues à partir de 0", () => {
    const pairs = seedBracket(["p1","p2","p3","p4"]);
    const positions = pairs.map(p => p.bracket_position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1]);
  });
});

describe("roundLabel", () => {
  it("retourne 'Finale' pour le dernier tour", () => {
    expect(roundLabel(3, 3)).toBe("Finale");
    expect(roundLabel(1, 1)).toBe("Finale");
  });

  it("retourne 'Demi-finales' pour l'avant-dernier tour", () => {
    expect(roundLabel(2, 3)).toBe("Demi-finales");
  });

  it("retourne 'Quarts de finale' à deux tours de la finale", () => {
    expect(roundLabel(2, 4)).toBe("Quarts de finale");
  });

  it("retourne 'Huitièmes' à trois tours de la finale", () => {
    expect(roundLabel(2, 5)).toBe("Huitièmes");
  });

  it("retourne 'Tour N' pour les tours plus lointains", () => {
    expect(roundLabel(1, 6)).toBe("Tour 1");
    expect(roundLabel(2, 7)).toBe("Tour 2");
  });
});

describe("computeTotalRounds", () => {
  it("2 matchs au 1er tour → 2 tours (finale + demi)", () => {
    expect(computeTotalRounds(2, 0)).toBe(2);
  });

  it("4 matchs au 1er tour → 3 tours (+ quarts)", () => {
    expect(computeTotalRounds(4, 0)).toBe(3);
  });

  it("8 matchs au 1er tour → 4 tours", () => {
    expect(computeTotalRounds(8, 0)).toBe(4);
  });

  it("16 matchs au 1er tour → 5 tours", () => {
    expect(computeTotalRounds(16, 0)).toBe(5);
  });

  it("utilise le fallback si r1Count est 0 (bracket en cours de création)", () => {
    expect(computeTotalRounds(0, 3)).toBe(3);
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
