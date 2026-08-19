import { describe, it, expect } from "vitest";
import {
  isPrefixAchievable,
  LEGAL_DART_VALUES,
  isValidDartShape,
  checkoutDartValue,
  satisfiesFinishType,
  type CheckoutDart,
} from "./x01";

/**
 * DO-SCORING-003 — tests unitaires purs de la faisabilité du préfixe de volée, indépendants de
 * la base : couvrent beaucoup plus de combinaisons que les seuls tests PostgreSQL de bout en
 * bout (lib/actions/x01ScoringFinalHardening.concurrency.test.ts), qui ne vérifient que
 * quelques scénarios représentatifs contre le vrai moteur.
 */

describe("LEGAL_DART_VALUES — ensemble réel des valeurs d'une fléchette", () => {
  it("contient toutes les valeurs simples 1..20, doubles 2..40 (pairs), triples 3..60 (multiples de 3), bull 25 et bull double 50", () => {
    for (let s = 1; s <= 20; s++) {
      expect(LEGAL_DART_VALUES).toContain(s); // simple
      expect(LEGAL_DART_VALUES).toContain(s * 2); // double
      expect(LEGAL_DART_VALUES).toContain(s * 3); // triple
    }
    expect(LEGAL_DART_VALUES).toContain(25);
    expect(LEGAL_DART_VALUES).toContain(50);
  });

  it("ne contient jamais 75 (triple bull, interdit)", () => {
    expect(LEGAL_DART_VALUES).not.toContain(75);
  });

  it("le maximum d'une seule fléchette est 60 (T20)", () => {
    expect(Math.max(...LEGAL_DART_VALUES)).toBe(60);
  });
});

describe("isPrefixAchievable — faisabilité du préfixe en 0, 1 ou 2 fléchettes légales (DO-SCORING-003)", () => {
  it("0 est toujours réalisable (aucune fléchette avant la fermeture)", () => {
    expect(isPrefixAchievable(0)).toBe(true);
  });

  it("exemples obligatoires de la mission", () => {
    // score 40 + D20(40) → préfixe 0
    expect(isPrefixAchievable(40 - 40)).toBe(true);
    // score 60 + D20(40) → préfixe 20 (S20, D10...)
    expect(isPrefixAchievable(60 - 40)).toBe(true);
    // score 100 + D20(40) → préfixe 60 (T20)
    expect(isPrefixAchievable(100 - 40)).toBe(true);
    // score 170 + bull double (50) → préfixe 120, réalisable par T20+T20
    expect(isPrefixAchievable(170 - 50)).toBe(true);
    // score 180 + D1(2) → préfixe 178, strictement impossible (max 2 fléchettes = 120)
    expect(isPrefixAchievable(180 - 2)).toBe(false);
  });

  it("toute valeur négative est refusée", () => {
    expect(isPrefixAchievable(-1)).toBe(false);
    expect(isPrefixAchievable(-40)).toBe(false);
  });

  it("toute valeur strictement supérieure à 120 (T20+T20, le maximum en deux fléchettes) est refusée", () => {
    expect(isPrefixAchievable(121)).toBe(false);
    expect(isPrefixAchievable(178)).toBe(false);
    expect(isPrefixAchievable(501)).toBe(false);
  });

  it("120 (T20+T20) est réalisable, mais des valeurs ≤120 peuvent rester réellement impossibles", () => {
    expect(isPrefixAchievable(120)).toBe(true);
    // 119 : aucune paire de fléchettes légales ne somme à 119 (vérifié exhaustivement ci-dessous).
    expect(isPrefixAchievable(119)).toBe(false);
  });

  it("chaque valeur légale d'une seule fléchette est un préfixe réalisable (cas à une fléchette)", () => {
    for (const v of LEGAL_DART_VALUES) {
      expect(isPrefixAchievable(v)).toBe(true);
    }
  });

  it("toute somme de deux fléchettes légales (y compris la même valeur deux fois) est un préfixe réalisable", () => {
    for (const a of LEGAL_DART_VALUES) {
      for (const b of LEGAL_DART_VALUES) {
        expect(isPrefixAchievable(a + b)).toBe(true);
      }
    }
  });

  it("vérification exhaustive et cohérente : pour chaque valeur de 0 à 130, la réponse correspond exactement à une recherche brute par force sur les fléchettes légales", () => {
    for (let target = 0; target <= 130; target++) {
      const bruteForce =
        target === 0 ||
        LEGAL_DART_VALUES.includes(target) ||
        LEGAL_DART_VALUES.some((a) => LEGAL_DART_VALUES.includes(target - a));
      expect(isPrefixAchievable(target)).toBe(bruteForce);
    }
  });
});

describe("Intégration checkout complet : fléchette + préfixe (DO-SCORING-003)", () => {
  function isFullCheckoutValid(scoreEntered: number, dart: CheckoutDart, finishType: "SINGLE" | "DOUBLE" | "MASTER" | "TRIPLE"): boolean {
    if (!isValidDartShape(dart)) return false;
    const dartValue = checkoutDartValue(dart);
    if (dartValue > scoreEntered) return false;
    if (!satisfiesFinishType(dart, finishType)) return false;
    return isPrefixAchievable(scoreEntered - dartValue);
  }

  it("score 180 fermé par un simple D1 est refusé même si D1 est un double légal pour DOUBLE (préfixe 178 impossible)", () => {
    expect(isFullCheckoutValid(180, { segment: 1, multiplier: 2 }, "DOUBLE")).toBe(false);
  });

  it("score 170 fermé par bull double (50) est accepté en DOUBLE (préfixe 120 = T20+T20)", () => {
    expect(isFullCheckoutValid(170, { segment: 25, multiplier: 2 }, "DOUBLE")).toBe(true);
  });

  it("checkoutDartValue supérieure à la volée est toujours refusée, indépendamment du préfixe", () => {
    expect(isFullCheckoutValid(40, { segment: 20, multiplier: 3 }, "DOUBLE")).toBe(false); // 60 > 40
  });

  it("segment/multiplicateur structurellement illégal est toujours refusé (triple bull)", () => {
    expect(isValidDartShape({ segment: 25, multiplier: 3 })).toBe(false);
  });
});
