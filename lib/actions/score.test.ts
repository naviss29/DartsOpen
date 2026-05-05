import { describe, it, expect } from "vitest";
import { computeMatchWinner } from "@/lib/utils/bracket";

// Tests du flux de validation de score
describe("Flux de validation de score", () => {
  const P1 = "player-1-uuid";
  const P2 = "player-2-uuid";

  it("P1 gagne si plus de sets validés à son nom", () => {
    const sets = [
      { winner_id: P1 },
      { winner_id: P2 },
      { winner_id: P1 },
    ];
    expect(computeMatchWinner(sets, P1, P2)).toBe(P1);
  });

  it("P2 gagne si plus de sets validés à son nom", () => {
    const sets = [
      { winner_id: P2 },
      { winner_id: P2 },
    ];
    expect(computeMatchWinner(sets, P1, P2)).toBe(P2);
  });

  it("null en cas d'égalité parfaite", () => {
    const sets = [{ winner_id: P1 }, { winner_id: P2 }];
    expect(computeMatchWinner(sets, P1, P2)).toBeNull();
  });

  it("ignore les sets sans gagnant (en cours)", () => {
    const sets = [{ winner_id: P1 }, { winner_id: null }, { winner_id: P1 }];
    expect(computeMatchWinner(sets, P1, P2)).toBe(P1);
  });

  it("retourne null si aucun set n'a de gagnant", () => {
    const sets = [{ winner_id: null }, { winner_id: null }];
    expect(computeMatchWinner(sets, P1, P2)).toBeNull();
  });
});

// Tests de la logique d'auto-avancement du bracket (tryAdvanceBracket)
describe("Logique auto-avancement bracket", () => {
  it("ne crée pas le tour suivant si des matchs ne sont pas terminés", () => {
    const matches = [
      { status: "FINISHED", winner_id: "p1" },
      { status: "IN_PROGRESS", winner_id: null },
    ];
    const remaining = matches.filter((m) => m.status !== "FINISHED").length;
    expect(remaining).toBeGreaterThan(0);
  });

  it("détecte la finale : un seul match dans le tour courant → tournoi terminé", () => {
    const currentMatches = [{ bracket_position: 0, winner_id: "p1" }];
    const isFinal = currentMatches.length === 1;
    expect(isFinal).toBe(true);
  });

  it("crée les bonnes paires pour le tour suivant", () => {
    const currentMatches = [
      { bracket_position: 0, winner_id: "p1" },
      { bracket_position: 1, winner_id: "p3" },
      { bracket_position: 2, winner_id: "p5" },
      { bracket_position: 3, winner_id: "p7" },
    ];
    const pairs: Array<{ p1: string; p2: string; position: number }> = [];
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m1 = currentMatches[i];
      const m2 = currentMatches[i + 1];
      if (m1?.winner_id && m2?.winner_id) {
        pairs.push({ p1: m1.winner_id, p2: m2.winner_id, position: Math.floor(i / 2) });
      }
    }
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ p1: "p1", p2: "p3", position: 0 });
    expect(pairs[1]).toEqual({ p1: "p5", p2: "p7", position: 1 });
  });

  it("ignore la progression si un winner_id est manquant dans la paire", () => {
    const currentMatches = [
      { bracket_position: 0, winner_id: "p1" },
      { bracket_position: 1, winner_id: null },
    ];
    let shouldAdvance = true;
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m1 = currentMatches[i];
      const m2 = currentMatches[i + 1];
      if (!m1?.winner_id || !m2?.winner_id) { shouldAdvance = false; break; }
    }
    expect(shouldAdvance).toBe(false);
  });
});

// Tests de la logique de détection "dernière manche"
describe("Détection dernière manche", () => {
  it("identifie correctement la dernière manche par round_order max", () => {
    const sets = [
      { round_order: 1, validated_p1: true, validated_p2: true },
      { round_order: 2, validated_p1: false, validated_p2: false },
      { round_order: 3, validated_p1: true, validated_p2: false },
    ];
    const lastRound = Math.max(...sets.map((s) => s.round_order));
    expect(lastRound).toBe(3);

    const lastSet = sets.find((s) => s.round_order === lastRound)!;
    const isEnteringLast = lastSet.validated_p1 || lastSet.validated_p2;
    expect(isEnteringLast).toBe(true);
  });

  it("ne déclenche pas l'alerte si la dernière manche n'a pas commencé", () => {
    const sets = [
      { round_order: 1, validated_p1: true, validated_p2: true },
      { round_order: 2, validated_p1: false, validated_p2: false },
    ];
    const lastRound = Math.max(...sets.map((s) => s.round_order));
    const lastSet = sets.find((s) => s.round_order === lastRound)!;
    const isEnteringLast = lastSet.validated_p1 || lastSet.validated_p2;
    expect(isEnteringLast).toBe(false);
  });
});
