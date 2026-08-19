import { describe, it, expect } from "vitest";
import { parseBoardNumber } from "./fieldBoard";

// DO-FIELD-ACCESS-002 — couverture exhaustive du parsing strict, en remplacement de parseInt()
// qui acceptait silencieusement "1abc" (scénarios obligatoires 14-18).
describe("parseBoardNumber", () => {
  it("accepte un entier positif simple", () => {
    expect(parseBoardNumber("1")).toBe(1);
    expect(parseBoardNumber("12")).toBe(12);
  });

  it("refuse un entier avec un suffixe non numérique", () => {
    expect(parseBoardNumber("1abc")).toBeNull();
  });

  it("refuse un nombre décimal", () => {
    expect(parseBoardNumber("1.5")).toBeNull();
  });

  it("refuse un nombre négatif", () => {
    expect(parseBoardNumber("-1")).toBeNull();
  });

  it("refuse zéro", () => {
    expect(parseBoardNumber("0")).toBeNull();
  });

  it("refuse une chaîne vide, null ou undefined", () => {
    expect(parseBoardNumber("")).toBeNull();
    expect(parseBoardNumber(null)).toBeNull();
    expect(parseBoardNumber(undefined)).toBeNull();
  });

  it("refuse un zéro non significatif (\"01\") — décision technique délibérée", () => {
    expect(parseBoardNumber("01")).toBeNull();
  });

  it("refuse une valeur manifestement absurde même sans borne connue", () => {
    expect(parseBoardNumber("999999")).toBeNull();
  });

  it("respecte la borne réelle du tournoi (maxBoards) quand elle est fournie", () => {
    expect(parseBoardNumber("4", 4)).toBe(4);
    expect(parseBoardNumber("5", 4)).toBeNull();
  });

  it("ignore les espaces ou notations scientifiques", () => {
    expect(parseBoardNumber(" 1")).toBeNull();
    expect(parseBoardNumber("1 ")).toBeNull();
    expect(parseBoardNumber("1e2")).toBeNull();
  });
});
