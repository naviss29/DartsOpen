import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

// SEC-006 — ces tests invoquent la vraie fonction proxy() (le point d'entrée middleware réel,
// jamais mocké) avec de vraies NextRequest, et inspectent les en-têtes de la vraie réponse
// qu'elle retourne — pas une simple assertion sur la constante buildSecurityHeaders() en
// isolation : ce qui est vérifié, c'est que la fonction réellement exécutée à chaque requête
// pose bien ces en-têtes, sur des routes représentatives (page publique, dashboard protégé,
// route métier temps réel).

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://dartsopen.bapps-studio.com"));
}

const ORIGINAL_MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL;

afterEach(() => {
  if (ORIGINAL_MERCURE_URL === undefined) delete process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL;
  else process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL = ORIGINAL_MERCURE_URL;
});

describe("proxy — headers de sécurité (SEC-006)", () => {
  it("pose les en-têtes principaux sur une page publique", async () => {
    const response = await proxy(request("/"));

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("la CSP ne contient aucun joker dangereux (default-src/script-src)", async () => {
    const response = await proxy(request("/"));
    const csp = response.headers.get("Content-Security-Policy")!;

    expect(csp).not.toMatch(/default-src\s+\*/);
    expect(csp).not.toMatch(/script-src[^;]*\*/);
    expect(csp).toContain("default-src 'self'");
  });

  it("pose les mêmes en-têtes sur une redirection SSO (dashboard sans session)", async () => {
    const response = await proxy(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("pose les en-têtes sur une route publique temps réel (/t/{id}/live)", async () => {
    const response = await proxy(request("/t/some-tournament-id/live"));

    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("pose les en-têtes sur une réponse 429 (rate limit atteint) sans jamais les oublier", async () => {
    // Sature la limite de /api/public (120/min) pour observer une vraie réponse 429.
    let last;
    for (let i = 0; i < 121; i++) {
      last = await proxy(request("/api/public/tournaments/x"));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("connect-src inclut l'origine Mercure quand NEXT_PUBLIC_MERCURE_PUBLIC_URL est configuré", async () => {
    process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL = "https://mercure.dartsopen.bapps-studio.com/.well-known/mercure";

    const response = await proxy(request("/t/some-tournament-id/live"));
    const csp = response.headers.get("Content-Security-Policy")!;

    expect(csp).toContain("https://mercure.dartsopen.bapps-studio.com");
  });

  it("ne casse rien si Mercure n'est pas configuré (repli polling documenté)", async () => {
    delete process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL;

    const response = await proxy(request("/t/some-tournament-id/live"));
    const csp = response.headers.get("Content-Security-Policy")!;

    expect(csp).toContain("connect-src 'self'");
  });

  it("form-action inclut l'origine SterPlatform (déconnexion SSO, POST de formulaire top-level)", async () => {
    const response = await proxy(request("/"));
    const csp = response.headers.get("Content-Security-Policy")!;

    expect(csp).toMatch(/form-action 'self'/);
  });
});
