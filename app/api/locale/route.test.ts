import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveLocalePreference } from "@/lib/i18n/config";

// Le domaine du cookie vient désormais de NEXT_PUBLIC_APP_URL (l'URL publique connue de CET
// environnement), jamais de l'URL de la requête entrante — voir le commentaire dans route.ts.
// Ces deux premiers tests simulent donc deux DÉPLOIEMENTS différents (pas deux visiteurs sur
// des sous-domaines différents d'un même déploiement, ce qui n'a jamais de sens ici).
const request = () =>
  new Request("http://localhost/api/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "es" }),
  });

describe("POST /api/locale", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("persiste une langue supportée dans un cookie HTTP, sans attribut Domain hors bapps-studio.com", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3002");

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ locale: "es" });
    expect(response.headers.get("set-cookie")).toContain("bapps_locale_shared=es");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
  });

  it("partage la préférence entre les sous-domaines BApps quand ce déploiement est sur bapps-studio.com", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");

    const response = await POST(request());

    expect(response.headers.get("set-cookie")).toContain("bapps_locale_shared=es");
    expect(response.headers.get("set-cookie")).toContain("Domain=bapps-studio.com");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("ne dépend plus de l'hôte de la requête entrante (régression du 2026-09-27 : derrière Coolify, celui-ci reflète l'adresse interne du conteneur, pas le domaine public — le cookie ne partait alors jamais avec Domain)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dartsopen.bapps-studio.com");
    // Un visiteur peut légitimement arriver via n'importe quel hôte (health-check interne,
    // ancien alias...) : la décision de partager le cookie ne doit dépendre QUE du
    // déploiement, jamais de cette valeur.
    const req = new Request("https://internal-healthcheck.invalid/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "es" }),
    });

    const response = await POST(req);

    expect(response.headers.get("set-cookie")).toContain("Domain=bapps-studio.com");
  });

  it("donne la priorité au cookie partagé et conserve l'ancien choix local en repli", () => {
    expect(resolveLocalePreference("es", "fr")).toBe("es");
    expect(resolveLocalePreference(undefined, "en")).toBe("en");
    expect(resolveLocalePreference("invalid", undefined)).toBe("fr");
  });

  it("refuse une langue non supportée sans poser de cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "de" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
