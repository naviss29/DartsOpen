import { describe, it, expect } from "vitest";

// ── Logique pure extraite de dbArbitrateMatch ─────────────────────────────────
// Recalcule vainqueur et statut d'un match à partir des sets arbitrés.
// Miroir exact de la logique en base — si on modifie dbArbitrateMatch, mettre à jour ici.
function computeMatchWinnerFromSets(
  setWinners: { winnerId: string | null }[],
  player1Id: string,
  player2Id: string
): { winnerId: string | null; status: "FINISHED" | "IN_PROGRESS" } {
  const p1Wins = setWinners.filter(s => s.winnerId === player1Id).length;
  const p2Wins = setWinners.filter(s => s.winnerId === player2Id).length;
  const total = setWinners.length;
  const allPlayed = setWinners.every(s => s.winnerId !== null);

  let winnerId: string | null = null;
  if (p1Wins > p2Wins && (allPlayed || p1Wins > Math.floor(total / 2))) winnerId = player1Id;
  else if (p2Wins > p1Wins && (allPlayed || p2Wins > Math.floor(total / 2))) winnerId = player2Id;

  const status: "FINISHED" | "IN_PROGRESS" = allPlayed && winnerId ? "FINISHED" : "IN_PROGRESS";
  return { winnerId, status };
}

// ── Logique pure extraite de dbArbitrateMatch ─────────────────────────────────
// Décide si les matchs suivants doivent être supprimés après une correction.
// En mode standard : oui (bracket statique, il faut régénérer à partir du round corrigé).
// En mode rapide : non (bracket dynamique, chaque match est indépendant).
function shouldDeleteSubsequentMatches(isQuickMode: boolean, bracketRound: number | null, newWinnerId: string | null, previousWinnerId: string | null): boolean {
  if (isQuickMode) return false;
  if (bracketRound === null) return false;
  return newWinnerId !== previousWinnerId;
}

// ── Tests recalcul vainqueur ──────────────────────────────────────────────────

describe("Arbitrage — recalcul du vainqueur", () => {
  const P1 = "player-1";
  const P2 = "player-2";

  it("p1 gagne 2-1 sur 3 manches jouées → P1 vainqueur, FINISHED", () => {
    const sets = [{ winnerId: P1 }, { winnerId: P2 }, { winnerId: P1 }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBe(P1);
    expect(result.status).toBe("FINISHED");
  });

  it("p2 gagne 3-0 → P2 vainqueur, FINISHED", () => {
    const sets = [{ winnerId: P2 }, { winnerId: P2 }, { winnerId: P2 }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBe(P2);
    expect(result.status).toBe("FINISHED");
  });

  it("majorité atteinte avant la dernière manche (2/3) → vainqueur sans attendre", () => {
    // 3 manches, p1 a déjà 2 victoires, 3e non jouée
    const sets = [{ winnerId: P1 }, { winnerId: P1 }, { winnerId: null }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBe(P1);
  });

  it("égalité 1-1 sur 2 manches jouées / 3 → pas de vainqueur, IN_PROGRESS", () => {
    const sets = [{ winnerId: P1 }, { winnerId: P2 }, { winnerId: null }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBeNull();
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("toutes les manches à null → IN_PROGRESS sans vainqueur", () => {
    const sets = [{ winnerId: null }, { winnerId: null }, { winnerId: null }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBeNull();
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("1 manche jouée sur 1 → FINISHED", () => {
    const sets = [{ winnerId: P1 }];
    const result = computeMatchWinnerFromSets(sets, P1, P2);
    expect(result.winnerId).toBe(P1);
    expect(result.status).toBe("FINISHED");
  });
});

// ── Tests suppression matchs suivants après arbitrage ─────────────────────────

describe("Arbitrage — suppression des matchs suivants", () => {
  const P1 = "player-1";
  const P2 = "player-2";

  it("mode standard + vainqueur changé → suppression des matchs suivants", () => {
    expect(shouldDeleteSubsequentMatches(false, 2, P1, P2)).toBe(true);
  });

  it("mode standard + même vainqueur → pas de suppression (rien ne change)", () => {
    expect(shouldDeleteSubsequentMatches(false, 2, P1, P1)).toBe(false);
  });

  it("mode standard + match de poule (bracketRound null) → pas de suppression", () => {
    expect(shouldDeleteSubsequentMatches(false, null, P1, P2)).toBe(false);
  });

  it("mode rapide + vainqueur changé → PAS de suppression (bracket dynamique indépendant)", () => {
    // En quick mode, WB round 2 et LB round 1 coexistent avec leurs propres compteurs.
    // Supprimer par bracketRound > N détruirait des matchs LB valides.
    expect(shouldDeleteSubsequentMatches(true, 2, P1, P2)).toBe(false);
  });

  it("mode rapide + même vainqueur → pas de suppression", () => {
    expect(shouldDeleteSubsequentMatches(true, 1, P1, P1)).toBe(false);
  });
});
