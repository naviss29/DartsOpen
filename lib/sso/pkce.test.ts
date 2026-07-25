import { describe, it, expect } from "vitest";
import { generateVerifier, challengeFor, generateState } from "./pkce";

describe("generateVerifier", () => {
  it("produces a sufficiently long, unpredictable value", () => {
    const a = generateVerifier();
    const b = generateVerifier();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
});

describe("challengeFor", () => {
  it("is deterministic for a given verifier", () => {
    const verifier = "fixed-verifier-value";
    expect(challengeFor(verifier)).toBe(challengeFor(verifier));
  });

  it("never contains standard base64 padding/characters unsafe in a URL", () => {
    const challenge = challengeFor(generateVerifier());
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
    expect(challenge).not.toContain("=");
  });

  it("differs for different verifiers", () => {
    expect(challengeFor("verifier-a")).not.toBe(challengeFor("verifier-b"));
  });
});

describe("generateState", () => {
  it("produces a unique value on each call", () => {
    expect(generateState()).not.toBe(generateState());
  });
});
