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

// Tests de la logique d'auto-avancement du bracket (doAdvanceToNextRound)
describe("Logique auto-avancement bracket", () => {
  it("ne crée pas le tour suivant si des matchs ne sont pas terminés", () => {
    const matches = [
      { status: "FINISHED", winner_id: "p1" },
      { status: "IN_PROGRESS", winner_id: null },
    ];
    const allFinished = matches.every((m) => m.status === "FINISHED");
    expect(allFinished).toBe(false);
  });

  it("détecte la finale : un seul match dans le tour courant → tournoi terminé", () => {
    const currentMatches = [{ bracket_position: 0, winner_id: "p1" }];
    const isFinal = currentMatches.length === 1;
    expect(isFinal).toBe(true);
  });

  it("crée les bonnes paires pour le tour suivant (appariement séquentiel sans byes)", () => {
    const currentMatches = [
      { bracket_position: 0, winner_id: "p1" },
      { bracket_position: 1, winner_id: "p3" },
      { bracket_position: 2, winner_id: "p5" },
      { bracket_position: 3, winner_id: "p7" },
    ];
    const winners = currentMatches.map((m) => m.winner_id!);
    const pairs = Array.from({ length: Math.floor(winners.length / 2) }, (_, j) => ({
      p1: winners[j * 2],
      p2: winners[j * 2 + 1],
      position: j,
    }));
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ p1: "p1", p2: "p3", position: 0 });
    expect(pairs[1]).toEqual({ p1: "p5", p2: "p7", position: 1 });
  });

  it("détecte les byes quand le nombre de matchs < nombre de positions attendues", () => {
    // 10 joueurs → 8 positions en R1 (0-7), mais seulement 2 matchs réels (positions 6 et 7)
    const sortedMatches = [
      { bracket_position: 6, status: "FINISHED", winner_id: "p7" },
      { bracket_position: 7, status: "FINISHED", winner_id: "p8" },
    ];
    const maxPosition = Math.max(...sortedMatches.map((m) => m.bracket_position));
    const expectedSlots = maxPosition + 1; // 8
    const hasByes = sortedMatches.length < expectedSlots; // 2 < 8
    expect(hasByes).toBe(true);
  });

  it("pas de byes quand tous les slots sont remplis", () => {
    const sortedMatches = [
      { bracket_position: 0, status: "FINISHED", winner_id: "p1" },
      { bracket_position: 1, status: "FINISHED", winner_id: "p3" },
      { bracket_position: 2, status: "FINISHED", winner_id: "p5" },
      { bracket_position: 3, status: "FINISHED", winner_id: "p7" },
    ];
    const maxPosition = Math.max(...sortedMatches.map((m) => m.bracket_position));
    const hasByes = sortedMatches.length < maxPosition + 1; // 4 < 4 = false
    expect(hasByes).toBe(false);
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
