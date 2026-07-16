import { describe, it, expect } from "vitest";
import { canTransition, assertValidTransition } from "./tournamentStatus";

describe("TournamentStatus — transitions légales", () => {
  it("DRAFT → OPEN est autorisée", () => {
    expect(canTransition("DRAFT", "OPEN")).toBe(true);
  });

  it("OPEN → IN_PROGRESS est autorisée", () => {
    expect(canTransition("OPEN", "IN_PROGRESS")).toBe(true);
  });

  it("IN_PROGRESS → FINISHED est autorisée", () => {
    expect(canTransition("IN_PROGRESS", "FINISHED")).toBe(true);
  });
});

describe("TournamentStatus — FINISHED est terminal", () => {
  it("FINISHED → n'importe quel statut est rejetée", () => {
    expect(canTransition("FINISHED", "DRAFT")).toBe(false);
    expect(canTransition("FINISHED", "OPEN")).toBe(false);
    expect(canTransition("FINISHED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("FINISHED", "FINISHED")).toBe(false);
  });
});

describe("TournamentStatus — transitions illégales", () => {
  it("rejette le statu quo (même statut)", () => {
    expect(canTransition("DRAFT", "DRAFT")).toBe(false);
    expect(canTransition("OPEN", "OPEN")).toBe(false);
  });

  it("rejette un retour en arrière", () => {
    expect(canTransition("OPEN", "DRAFT")).toBe(false);
    expect(canTransition("IN_PROGRESS", "OPEN")).toBe(false);
    expect(canTransition("FINISHED", "IN_PROGRESS")).toBe(false);
  });

  it("rejette le saut d'étape", () => {
    expect(canTransition("DRAFT", "IN_PROGRESS")).toBe(false);
    expect(canTransition("DRAFT", "FINISHED")).toBe(false);
    expect(canTransition("OPEN", "FINISHED")).toBe(false);
  });

  it("rejette un statut inconnu", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(false);
    expect(canTransition("BOGUS", "OPEN")).toBe(false);
  });
});

describe("assertValidTransition", () => {
  it("ne lève pas d'erreur pour une transition légale", () => {
    expect(() => assertValidTransition("DRAFT", "OPEN")).not.toThrow();
  });

  it("lève une erreur pour une transition illégale", () => {
    expect(() => assertValidTransition("DRAFT", "FINISHED")).toThrow(/Transition de statut invalide/);
  });
});
