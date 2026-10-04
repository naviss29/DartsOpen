import { describe, expect, it } from "vitest";
import packageJson from "@/package.json";
import { deployedVersion } from "./deployedVersion";

const BASE = packageJson.version;

describe("deployedVersion", () => {
  it("ajoute le SHA court du commit injecté par Coolify (SOURCE_COMMIT)", () => {
    expect(deployedVersion({ SOURCE_COMMIT: "9c2d6a1f0e5b2750ab1234567890abcdef123456" })).toBe(`${BASE}+9c2d6a1`);
  });

  it("APP_COMMIT_SHA prime sur SOURCE_COMMIT (hébergement hors Coolify)", () => {
    expect(deployedVersion({ APP_COMMIT_SHA: "de3ab47", SOURCE_COMMIT: "9c2d6a1" })).toBe(`${BASE}+de3ab47`);
  });

  it("sans commit connu, renvoie la seule version du package", () => {
    expect(deployedVersion({})).toBe(BASE);
    expect(deployedVersion({ SOURCE_COMMIT: "   " })).toBe(BASE);
  });

  it("ignore une valeur qui n'est pas un SHA (jamais de chaîne arbitraire sur une route publique)", () => {
    expect(deployedVersion({ SOURCE_COMMIT: "unknown" })).toBe(BASE);
    expect(deployedVersion({ SOURCE_COMMIT: "<script>alert(1)</script>" })).toBe(BASE);
  });
});
