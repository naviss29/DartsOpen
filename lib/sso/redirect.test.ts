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
