import { describe, it, expect } from "vitest";
import { ssoStartPath, sanitizeNextPath } from "./redirect";

describe("ssoStartPath", () => {
  it("returns the bare path when there is no next", () => {
    expect(ssoStartPath()).toBe("/api/auth/sso/start");
  });

  it("appends an encoded next param", () => {
    expect(ssoStartPath("/tournaments/abc?tab=poules")).toBe(
      "/api/auth/sso/start?next=%2Ftournaments%2Fabc%3Ftab%3Dpoules",
    );
  });
});

describe("sanitizeNextPath", () => {
  it("defaults to /dashboard when null/undefined/empty", () => {
    expect(sanitizeNextPath(null)).toBe("/dashboard");
    expect(sanitizeNextPath(undefined)).toBe("/dashboard");
    expect(sanitizeNextPath("")).toBe("/dashboard");
  });

  it("accepts a plain internal relative path", () => {
    expect(sanitizeNextPath("/tournaments")).toBe("/tournaments");
  });

  it("rejects a protocol-relative URL (open redirect)", () => {
    expect(sanitizeNextPath("//evil.example.com")).toBe("/dashboard");
  });

  it("rejects an absolute external URL", () => {
    expect(sanitizeNextPath("https://evil.example.com/phish")).toBe("/dashboard");
  });

  it("rejects a path not starting with a slash", () => {
    expect(sanitizeNextPath("dashboard")).toBe("/dashboard");
  });
});

describe("sanitizeNextPath — non-régression redirection ouverte (antislash, contrôle, encodage)", () => {
  const APP = "https://app.example.test";

  // Vérifie le rejet ET que la destination finale reste sur l'origine de l'app : c'est
  // `new URL(next, appUrl)` qui est réellement suivi par le callback SSO.
  function expectSafe(raw: string) {
    const next = sanitizeNextPath(raw);
    expect(next).toBe("/dashboard");
    expect(new URL(next, APP).origin).toBe(APP);
  }

  it("rejects a backslash path (/\\evil.com resolves to https://evil.com via WHATWG URL)", () => {
    // Preuve que la faille est réelle : sans filtre, le parseur sort de l'origine.
    expect(new URL("/\\evil.com", APP).origin).toBe("https://evil.com");
    expectSafe("/\\evil.com");
  });

  it("rejects an encoded backslash (/%5Cevil.com) and its decoded form", () => {
    expectSafe("/%5Cevil.com");
    expectSafe("/%5cevil.com");
    expectSafe(decodeURIComponent("/%5Cevil.com"));
  });

  it("rejects a tab, newline or NUL used to rebuild // after URL parsing", () => {
    expect(new URL("/\t/evil.com", APP).origin).toBe("https://evil.com");
    expectSafe("/\t/evil.com");
    expectSafe("/%09/evil.com");
    expectSafe("/\n/evil.com");
    expectSafe("/\u0000/evil.com");
  });

  it("rejects leading/trailing whitespace", () => {
    expectSafe(" /dashboard");
    expectSafe("/dashboard ");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expectSafe("//evil.com");
    expectSafe("https://evil.com");
  });

  it("rejects a malformed percent sequence (fail closed)", () => {
    expectSafe("/%E0%A4%A");
  });

  it("keeps a valid internal path with query string", () => {
    expect(sanitizeNextPath("/dashboard?x=1")).toBe("/dashboard?x=1");
    expect(new URL(sanitizeNextPath("/dashboard?x=1"), APP).href).toBe(`${APP}/dashboard?x=1`);
  });
});
