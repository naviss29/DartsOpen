import { describe, it, expect } from "vitest";

const IMPOSSIBLE_VOLEE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);
const IMPOSSIBLE_CHECKOUT = new Set([159, 162, 163, 165, 166, 168, 169]);

function validateVolee(
  voleeScore: number,
  remaining: number,
  finishType: "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER"
): { bust: boolean; reason: string | null; impossibleCheckout: boolean } {
  if (IMPOSSIBLE_VOLEE.has(voleeScore)) {
    return { bust: true, reason: `${voleeScore} est impossible à réaliser en une volée.`, impossibleCheckout: false };
  }
  const newRemaining = remaining - voleeScore;
  if (newRemaining < 0) {
    return { bust: true, reason: `Bust ! reste à ${remaining}.`, impossibleCheckout: false };
  }
  if ((finishType === "DOUBLE" || finishType === "MASTER") && newRemaining === 1) {
    return { bust: true, reason: `Bust ! Impossible de laisser 1 en double out.`, impossibleCheckout: false };
  }
  const impossibleCheckout = newRemaining > 0 && IMPOSSIBLE_CHECKOUT.has(newRemaining);
  return { bust: false, reason: null, impossibleCheckout };
}

describe("Validation volée 501 — scores impossibles à réaliser", () => {
  it("163 est rejeté (impossible en une volée)", () => {
    const r = validateVolee(163, 300, "DOUBLE");
    expect(r.bust).toBe(true);
    expect(r.reason).toContain("impossible");
  });

  it("166 est rejeté", () => {
    expect(validateVolee(166, 300, "DOUBLE").bust).toBe(true);
  });

  it("169 est rejeté", () => {
    expect(validateVolee(169, 300, "DOUBLE").bust).toBe(true);
  });

  it("172, 173, 175, 176, 178, 179 sont rejetés", () => {
    for (const s of [172, 173, 175, 176, 178, 179]) {
      expect(validateVolee(s, 300, "DOUBLE").bust).toBe(true);
    }
  });

  it("180 est accepté (T20+T20+T20)", () => {
    expect(validateVolee(180, 501, "DOUBLE").bust).toBe(false);
  });

  it("60 est accepté (T20)", () => {
    expect(validateVolee(60, 200, "DOUBLE").bust).toBe(false);
  });
});

describe("Validation volée 501 — bust classique", () => {
  it("volée supérieure au restant → bust", () => {
    const r = validateVolee(60, 30, "SINGLE");
    expect(r.bust).toBe(true);
    expect(r.reason).toContain("Bust");
  });

  it("volée égale au restant → fermeture (pas de bust)", () => {
    expect(validateVolee(32, 32, "SINGLE").bust).toBe(false);
  });
});

describe("Validation volée 501 — double out, restant = 1", () => {
  it("laisser 1 en double out → bust", () => {
    const r = validateVolee(30, 31, "DOUBLE");
    expect(r.bust).toBe(true);
    expect(r.reason).toContain("laisser 1");
  });

  it("laisser 1 en master out → bust", () => {
    expect(validateVolee(30, 31, "MASTER").bust).toBe(true);
  });

  it("laisser 1 en single out → pas de bust (autorisé)", () => {
    expect(validateVolee(30, 31, "SINGLE").bust).toBe(false);
  });

  it("laisser 2 en double out → pas de bust", () => {
    expect(validateVolee(29, 31, "DOUBLE").bust).toBe(false);
  });
});

describe("Validation volée 501 — positions de fermeture impossible", () => {
  it("restant 169 → impossibleCheckout = true", () => {
    expect(validateVolee(32, 201, "DOUBLE").impossibleCheckout).toBe(true); // 201-32 = 169
  });

  it("restant 168 → impossibleCheckout = true", () => {
    expect(validateVolee(33, 201, "DOUBLE").impossibleCheckout).toBe(true); // 201-33 = 168
  });

  it("restant 159, 162, 163, 165, 166 → impossibleCheckout = true", () => {
    const cases = [
      { volee: 42, remaining: 201 }, // 201-42 = 159
      { volee: 39, remaining: 201 }, // 201-39 = 162
      { volee: 38, remaining: 201 }, // 201-38 = 163
      { volee: 36, remaining: 201 }, // 201-36 = 165
      { volee: 35, remaining: 201 }, // 201-35 = 166
    ];
    for (const c of cases) {
      expect(validateVolee(c.volee, c.remaining, "DOUBLE").impossibleCheckout).toBe(true);
    }
  });

  it("restant 170 → impossibleCheckout = false (checkout possible : T20+T20+Bull)", () => {
    expect(validateVolee(31, 201, "DOUBLE").impossibleCheckout).toBe(false); // 201-31 = 170
  });

  it("restant 0 → pas de warning (match terminé)", () => {
    expect(validateVolee(32, 32, "DOUBLE").impossibleCheckout).toBe(false);
  });
});
