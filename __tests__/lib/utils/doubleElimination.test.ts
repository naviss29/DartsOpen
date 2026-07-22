import { describe, it, expect } from "vitest";
import {
  getQuickModeGameFormat,
  pairPlayers,
  shufflePlayers,
  QUICK_ROUND_FORMATS,
} from "@/lib/utils/doubleElimination";

// ── getQuickModeGameFormat ────────────────────────────────────────────────────

describe("getQuickModeGameFormat", () => {
  describe("Grande Finale", () => {
    it("retourne 701 finish double quelle que soit la taille", () => {
      expect(getQuickModeGameFormat(2, "GRAND_FINAL")).toEqual(QUICK_ROUND_FORMATS.LATE);
      expect(getQuickModeGameFormat(10, "GRAND_FINAL")).toEqual(QUICK_ROUND_FORMATS.LATE);
    });
  });

  describe("≤ 4 joueurs actifs — demi-finales / finale", () => {
    it("retourne 701 finish double pour WB", () => {
      expect(getQuickModeGameFormat(4, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.LATE);
      expect(getQuickModeGameFormat(3, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.LATE);
      expect(getQuickModeGameFormat(2, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.LATE);
    });

    it("retourne 701 finish double pour LB", () => {
      expect(getQuickModeGameFormat(4, "LOSERS")).toEqual(QUICK_ROUND_FORMATS.LATE);
      expect(getQuickModeGameFormat(3, "LOSERS")).toEqual(QUICK_ROUND_FORMATS.LATE);
    });
  });

  describe("5–8 joueurs actifs — huitièmes / quarts de finale", () => {
    it("retourne Cricket pour WB", () => {
      expect(getQuickModeGameFormat(8, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.MID);
      expect(getQuickModeGameFormat(5, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.MID);
    });

    it("retourne Cricket pour LB", () => {
      expect(getQuickModeGameFormat(8, "LOSERS")).toEqual(QUICK_ROUND_FORMATS.MID);
      expect(getQuickModeGameFormat(6, "LOSERS")).toEqual(QUICK_ROUND_FORMATS.MID);
    });
  });

  describe("> 8 joueurs actifs — tours préliminaires", () => {
    it("retourne 501 fermeture double pour WB", () => {
      expect(getQuickModeGameFormat(16, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.EARLY);
      expect(getQuickModeGameFormat(9,  "WINNERS")).toEqual(QUICK_ROUND_FORMATS.EARLY);
      expect(getQuickModeGameFormat(32, "WINNERS")).toEqual(QUICK_ROUND_FORMATS.EARLY);
    });

    it("retourne Cricket pour LB (toujours, même tôt dans le tournoi)", () => {
      expect(getQuickModeGameFormat(16, "LOSERS")).toEqual(QUICK_ROUND_FORMATS.MID);
      expect(getQuickModeGameFormat(9,  "LOSERS")).toEqual(QUICK_ROUND_FORMATS.MID);
    });
  });

  describe("valeurs des formats", () => {
    it("EARLY = 501 fermeture double", () => {
      expect(QUICK_ROUND_FORMATS.EARLY).toEqual({
        game_type: "501",
        entry_type: "SINGLE",
        finish_type: "DOUBLE",
      });
    });

    it("MID = Cricket straight/straight", () => {
      expect(QUICK_ROUND_FORMATS.MID).toEqual({
        game_type: "CRICKET",
        entry_type: "SINGLE",
        finish_type: "SINGLE",
      });
    });

    it("LATE = 701 finish double", () => {
      expect(QUICK_ROUND_FORMATS.LATE).toEqual({
        game_type: "701",
        entry_type: "SINGLE",
        finish_type: "DOUBLE",
      });
    });
  });
});

// ── pairPlayers ───────────────────────────────────────────────────────────────

describe("pairPlayers", () => {
  it("retourne une paire pour 2 joueurs", () => {
    expect(pairPlayers(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("retourne 2 paires pour 4 joueurs", () => {
    expect(pairPlayers(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("retourne 4 paires pour 8 joueurs", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    expect(pairPlayers(ids)).toHaveLength(4);
  });

  it("ignore le dernier joueur si le nombre est impair", () => {
    const result = pairPlayers(["a", "b", "c"]);
    expect(result).toEqual([["a", "b"]]);
    expect(result).toHaveLength(1);
  });

  it("retourne un tableau vide pour 0 joueur", () => {
    expect(pairPlayers([])).toEqual([]);
  });

  it("retourne un tableau vide pour 1 joueur", () => {
    expect(pairPlayers(["solo"])).toEqual([]);
  });

  it("préserve l'ordre des joueurs", () => {
    const ids = ["x", "y", "z", "w"];
    const result = pairPlayers(ids);
    expect(result[0][0]).toBe("x");
    expect(result[0][1]).toBe("y");
    expect(result[1][0]).toBe("z");
    expect(result[1][1]).toBe("w");
  });
});

// ── shufflePlayers ────────────────────────────────────────────────────────────

describe("shufflePlayers", () => {
  it("conserve tous les éléments du tableau", () => {
    const original = ["p1", "p2", "p3", "p4", "p5"];
    const result = shufflePlayers(original);
    expect(result).toHaveLength(original.length);
    expect([...result].sort()).toEqual([...original].sort());
  });

  it("ne modifie pas le tableau original", () => {
    const original = ["a", "b", "c", "d"];
    const copy = [...original];
    shufflePlayers(original);
    expect(original).toEqual(copy);
  });

  it("retourne un tableau vide pour une entrée vide", () => {
    expect(shufflePlayers([])).toEqual([]);
  });

  it("retourne le seul élément pour un tableau à 1 entrée", () => {
    expect(shufflePlayers(["only"])).toEqual(["only"]);
  });

  it("produit des ordres différents sur un grand tableau (probabiliste)", () => {
    // Avec 10 éléments, la probabilité que 100 shuffles donnent tous le même ordre est infime
    const original = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const results = new Set(
      Array.from({ length: 50 }, () => shufflePlayers(original).join(","))
    );
    // Au moins 2 ordres distincts parmi 50 shuffles
    expect(results.size).toBeGreaterThan(1);
  });
});
