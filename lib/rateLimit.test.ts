import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, clientIp } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("autorise les requêtes sous la limite", () => {
    const rule = { windowMs: 60_000, max: 3 };
    const key = `test-${Math.random()}`;

    expect(checkRateLimit(key, rule).allowed).toBe(true);
    expect(checkRateLimit(key, rule).allowed).toBe(true);
    expect(checkRateLimit(key, rule).allowed).toBe(true);
  });

  it("bloque au-delà de la limite et renvoie un retryAfterSeconds positif", () => {
    const rule = { windowMs: 60_000, max: 2 };
    const key = `test-${Math.random()}`;

    checkRateLimit(key, rule);
    checkRateLimit(key, rule);
    const result = checkRateLimit(key, rule);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isole les compteurs par clé", () => {
    const rule = { windowMs: 60_000, max: 1 };
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;

    expect(checkRateLimit(keyA, rule).allowed).toBe(true);
    expect(checkRateLimit(keyA, rule).allowed).toBe(false);
    expect(checkRateLimit(keyB, rule).allowed).toBe(true);
  });

  it("réinitialise le compteur une fois la fenêtre expirée", () => {
    vi.useFakeTimers();
    const rule = { windowMs: 1000, max: 1 };
    const key = `test-${Math.random()}`;

    expect(checkRateLimit(key, rule).allowed).toBe(true);
    expect(checkRateLimit(key, rule).allowed).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(checkRateLimit(key, rule).allowed).toBe(true);
    vi.useRealTimers();
  });
});

describe("clientIp", () => {
  it("utilise le premier IP de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.1");
  });

  it("retombe sur x-real-ip si x-forwarded-for est absent", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.2" });
    expect(clientIp(headers)).toBe("203.0.113.2");
  });

  it("retourne 'unknown' si aucun en-tête n'est présent", () => {
    const headers = new Headers();
    expect(clientIp(headers)).toBe("unknown");
  });
});
