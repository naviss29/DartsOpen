import { describe, it, expect } from "vitest";
import { Prisma } from "../generated/prisma/client";
import { p2002ConstraintIdentifiers } from "./prismaErrors";

function makeP2002(meta: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: meta as Record<string, unknown>,
  });
}

describe("p2002ConstraintIdentifiers", () => {
  it("retourne [] pour une erreur qui n'est pas un P2002 Prisma", () => {
    expect(p2002ConstraintIdentifiers(new Error("autre chose"))).toEqual([]);
    expect(p2002ConstraintIdentifiers(null)).toEqual([]);
    expect(p2002ConstraintIdentifiers(undefined)).toEqual([]);
  });

  it("lit meta.target sous forme de tableau (query engine intégré, ancienne forme)", () => {
    const err = makeP2002({ target: ["match_id", "type"] });
    expect(p2002ConstraintIdentifiers(err)).toEqual(expect.arrayContaining(["match_id", "type"]));
  });

  it("lit meta.target sous forme de chaîne unique", () => {
    const err = makeP2002({ target: "idempotency_key" });
    expect(p2002ConstraintIdentifiers(err)).toContain("idempotency_key");
  });

  it("lit driverAdapterError.cause.constraint.fields (forme prisma@7.8.0)", () => {
    const err = makeP2002({
      driverAdapterError: { cause: { constraint: { fields: ["match_id", "type"] } } },
    });
    expect(p2002ConstraintIdentifiers(err)).toEqual(expect.arrayContaining(["match_id", "type"]));
  });

  it("lit driverAdapterError.cause.constraint.index (forme prisma@7.10.0, régression détectée par l'audit pré-recette)", () => {
    const err = makeP2002({
      driverAdapterError: { cause: { constraint: { index: "field_incidents_open_dedup" } } },
    });
    expect(p2002ConstraintIdentifiers(err)).toContain("field_incidents_open_dedup");
  });

  it("l'index complet contient le nom de colonne en sous-chaîne (cas réel tournaments_user_id_idempotency_key_key)", () => {
    const err = makeP2002({
      driverAdapterError: { cause: { constraint: { index: "tournaments_user_id_idempotency_key_key" } } },
    });
    const ids = p2002ConstraintIdentifiers(err);
    expect(ids.some((id) => id.includes("idempotency_key"))).toBe(true);
  });

  it("lit driverAdapterError.cause.constraint.name", () => {
    const err = makeP2002({
      driverAdapterError: { cause: { constraint: { name: "matches_one_active_per_board" } } },
    });
    expect(p2002ConstraintIdentifiers(err)).toContain("matches_one_active_per_board");
  });

  it("combine toutes les formes présentes à la fois, sans en privilégier une seule", () => {
    const err = makeP2002({
      target: ["a"],
      driverAdapterError: { cause: { constraint: { fields: ["b"], index: "c", name: "d" } } },
    });
    expect(p2002ConstraintIdentifiers(err)).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
  });
});
