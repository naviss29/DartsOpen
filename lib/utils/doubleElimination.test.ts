import { describe, it, expect } from "vitest";
import { pairPlayers, shufflePlayers, getQuickModeGameFormat, QUICK_ROUND_FORMATS } from "./doubleElimination";

// ── pairPlayers ───────────────────────────────────────────────────────────────

describe("pairPlayers", () => {
  it("apparie 4 joueurs en 2 paires séquentielles", () => {
    const pairs = pairPlayers(["A", "B", "C", "D"]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual(["A", "B"]);
    expect(pairs[1]).toEqual(["C", "D"]);
  });

  it("nombre impair : le dernier joueur n'est pas apparié (reste en attente)", () => {
    const pairs = pairPlayers(["A", "B", "C"]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual(["A", "B"]);
    // "C" n'est dans aucune paire — il attendra le prochain tour
  });

  it("2 joueurs → 1 seule paire", () => {
    const pairs = pairPlayers(["A", "B"]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual(["A", "B"]);
  });

  it("1 joueur → aucune paire", () => {
    expect(pairPlayers(["A"])).toHaveLength(0);
  });

  it("0 joueur → tableau vide", () => {
    expect(pairPlayers([])).toHaveLength(0);
  });
});

// ── shufflePlayers ────────────────────────────────────────────────────────────

describe("shufflePlayers", () => {
  it("retourne un tableau de même longueur", () => {
    const input = ["A", "B", "C", "D", "E"];
    expect(shufflePlayers(input)).toHaveLength(input.length);
  });

  it("contient exactement les mêmes éléments que l'entrée", () => {
    const input = ["A", "B", "C", "D"];
    const result = shufflePlayers(input);
    expect(result.sort()).toEqual([...input].sort());
  });

  it("ne modifie pas le tableau original", () => {
    const input = ["A", "B", "C"];
    const copy = [...input];
    shufflePlayers(input);
    expect(input).toEqual(copy);
  });

  it("tableau vide → retourne tableau vide", () => {
    expect(shufflePlayers([])).toEqual([]);
  });

  it("tableau à 1 élément → retourne le même élément", () => {
    expect(shufflePlayers(["solo"])).toEqual(["solo"]);
  });
});

// ── getQuickModeGameFormat ────────────────────────────────────────────────────
// DO-QUICK-POOL-001 — bassin unique : plus de paramètre bracketType, le format ne dépend
// plus que du nombre de joueurs encore en vie dans le tournoi.

describe("getQuickModeGameFormat — sélection du format de jeu", () => {
  it("≤ 4 joueurs actifs → 701 finish double (demi-finale / finale)", () => {
    expect(getQuickModeGameFormat(4)).toEqual(QUICK_ROUND_FORMATS.LATE);
    expect(getQuickModeGameFormat(3)).toEqual(QUICK_ROUND_FORMATS.LATE);
    expect(getQuickModeGameFormat(2)).toEqual(QUICK_ROUND_FORMATS.LATE);
  });

  it("5–8 joueurs actifs → Cricket (quarts / huitièmes)", () => {
    expect(getQuickModeGameFormat(5)).toEqual(QUICK_ROUND_FORMATS.MID);
    expect(getQuickModeGameFormat(8)).toEqual(QUICK_ROUND_FORMATS.MID);
    expect(getQuickModeGameFormat(6)).toEqual(QUICK_ROUND_FORMATS.MID);
  });

  it("> 8 joueurs → 501 fermeture double (phase de groupes)", () => {
    expect(getQuickModeGameFormat(9)).toEqual(QUICK_ROUND_FORMATS.EARLY);
    expect(getQuickModeGameFormat(16)).toEqual(QUICK_ROUND_FORMATS.EARLY);
  });

  it("limite basse 5 → MID, limite haute 8 → MID (bornes incluses)", () => {
    expect(getQuickModeGameFormat(5)).toEqual(QUICK_ROUND_FORMATS.MID);
    expect(getQuickModeGameFormat(8)).toEqual(QUICK_ROUND_FORMATS.MID);
  });

  it("limite basse 9 → passe en EARLY", () => {
    expect(getQuickModeGameFormat(9)).toEqual(QUICK_ROUND_FORMATS.EARLY);
  });
});

// ── Vérification des constantes de format ────────────────────────────────────

describe("QUICK_ROUND_FORMATS — structure des formats", () => {
  it("EARLY = 501 sortie double", () => {
    expect(QUICK_ROUND_FORMATS.EARLY.game_type).toBe("501");
    expect(QUICK_ROUND_FORMATS.EARLY.finish_type).toBe("DOUBLE");
  });

  it("MID = Cricket", () => {
    expect(QUICK_ROUND_FORMATS.MID.game_type).toBe("CRICKET");
  });

  it("LATE = 701 sortie double", () => {
    expect(QUICK_ROUND_FORMATS.LATE.game_type).toBe("701");
    expect(QUICK_ROUND_FORMATS.LATE.finish_type).toBe("DOUBLE");
  });
});
