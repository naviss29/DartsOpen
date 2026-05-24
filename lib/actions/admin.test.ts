import { describe, it, expect } from "vitest";

// Logique pure extraite de dbArbitrateMatch — recalcul du vainqueur d'un match
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
