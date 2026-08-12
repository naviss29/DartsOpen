import { describe, it, expect, afterAll } from "vitest";
import { randomUUID, createHash } from "crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { checkRateLimit, clientIp } from "./rateLimit";

// SEC-005 — preuve réelle, contre un vrai PostgreSQL (jamais mocké), que le rate limiting est
// désormais partagé entre instances applicatives : deux PrismaClient distincts (chacun sa
// propre connexion/pool, comme deux processus Node séparés) doivent voir et faire évoluer le
// même compteur. Un test qui ne solliciterait qu'un seul client ne prouverait rien de plus que
// l'ancienne Map en mémoire du process.

function secondInstanceClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const instanceB = secondInstanceClient();

afterAll(async () => {
  await instanceB.$disconnect();
});

async function cleanupKey(rawKey: string): Promise<void> {
  const hashed = createHash("sha256").update(rawKey).digest("hex");
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE key = ${hashed}`;
}

describe("checkRateLimit — nominal", () => {
  it("autorise les appels sous le seuil, refuse celui qui le dépasse", async () => {
    const key = `test:nominal:${randomUUID()}`;
    await cleanupKey(key);

    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      results.push((await checkRateLimit(key, { windowMs: 60_000, max: 3 })).allowed);
    }

    // 3 premiers appels autorisés (count 1,2,3) ; le 4e (count 4 > max) refusé.
    expect(results).toEqual([true, true, true, false]);
  });

  it("fournit un retryAfterSeconds positif et cohérent avec la fenêtre lorsque la limite est atteinte", async () => {
    const key = `test:retry-after:${randomUUID()}`;
    await cleanupKey(key);
    const windowMs = 10_000;

    await checkRateLimit(key, { windowMs, max: 1 });
    const blocked = await checkRateLimit(key, { windowMs, max: 1 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10);
  });
});

describe("checkRateLimit — atomicité (concurrence réelle)", () => {
  it("des appels strictement simultanés sur la même clé ne dépassent jamais silencieusement le seuil", async () => {
    const key = `test:concurrency:${randomUUID()}`;
    await cleanupKey(key);
    const MAX = 5;

    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit(key, { windowMs: 60_000, max: MAX })),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(MAX);
  });
});

describe("checkRateLimit — preuve multi-instance", () => {
  it("deux PrismaClient distincts (deux connexions séparées, comme deux instances applicatives) partagent le même compteur", async () => {
    const key = `test:multi-instance:${randomUUID()}`;
    await cleanupKey(key);
    const rule = { windowMs: 60_000, max: 4 };

    const r1 = await checkRateLimit(key, rule, prisma); // instance A, count=1
    const r2 = await checkRateLimit(key, rule, instanceB); // instance B, count=2
    const r3 = await checkRateLimit(key, rule, prisma); // instance A, count=3
    const r4 = await checkRateLimit(key, rule, instanceB); // instance B, count=4
    const r5 = await checkRateLimit(key, rule, prisma); // instance A, count=5 → refusé

    expect([r1, r2, r3, r4, r5].map((r) => r.allowed)).toEqual([true, true, true, true, false]);
  });

  it("des requêtes concurrentes réparties sur deux instances distinctes ne dépassent jamais le seuil global", async () => {
    const key = `test:multi-instance-concurrency:${randomUUID()}`;
    await cleanupKey(key);
    const rule = { windowMs: 60_000, max: 6 };

    const callsOnA = Array.from({ length: 10 }, () => checkRateLimit(key, rule, prisma));
    const callsOnB = Array.from({ length: 10 }, () => checkRateLimit(key, rule, instanceB));
    const results = await Promise.all([...callsOnA, ...callsOnB]);

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(rule.max);
  });
});

describe("checkRateLimit — fenêtre", () => {
  it("après expiration de la fenêtre, une nouvelle requête est de nouveau autorisée", async () => {
    const key = `test:window:${randomUUID()}`;
    await cleanupKey(key);
    const rule = { windowMs: 200, max: 1 }; // fenêtre très courte

    const first = await checkRateLimit(key, rule);
    const second = await checkRateLimit(key, rule);
    expect([first.allowed, second.allowed]).toEqual([true, false]);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const afterExpiry = await checkRateLimit(key, rule);
    expect(afterExpiry.allowed).toBe(true);
  });
});

describe("checkRateLimit — clés distinctes", () => {
  it("deux clés différentes (ex. deux IP) ne se bloquent jamais mutuellement", async () => {
    const keyA = `test:distinct-a:${randomUUID()}`;
    const keyB = `test:distinct-b:${randomUUID()}`;
    await cleanupKey(keyA);
    await cleanupKey(keyB);
    const rule = { windowMs: 60_000, max: 3 };

    for (let i = 0; i < 3; i++) {
      await checkRateLimit(keyA, rule);
    }
    const blockedOnA = await checkRateLimit(keyA, rule);
    const allowedOnB = await checkRateLimit(keyB, rule);

    expect(blockedOnA.allowed).toBe(false);
    expect(allowedOnB.allowed).toBe(true);
  });
});

describe("checkRateLimit — stockage indisponible", () => {
  it("fail-open : une erreur du store ne bloque jamais la requête, et ne fait jamais planter l'appelant", async () => {
    const failingStore = {
      $queryRaw: () => Promise.reject(new Error("connexion PostgreSQL simulée indisponible")),
      $executeRaw: () => Promise.reject(new Error("connexion PostgreSQL simulée indisponible")),
    };

    const result = await checkRateLimit(`test:store-down:${randomUUID()}`, { windowMs: 60_000, max: 1 }, failingStore);

    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
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
