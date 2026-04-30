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
