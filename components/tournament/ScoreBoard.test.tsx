import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ScoreBoard as ScoreBoardType } from "./ScoreBoard";

/**
 * 2026-09-27 (trouvé pendant l'audit CORS, cf. Reprise-Validation-JWKS.md) : `connect()`
 * appelait une URL ABSOLUE vers SterPlatform pour récupérer le jeton Mercure
 * (`${NEXT_PUBLIC_API_URL}/api/public/tournaments/:id/mercure-token`), alors que cette route
 * n'existe que localement à DartsOpen (app/api/public/tournaments/[id]/mercure-token/route.ts) —
 * comme l'appel voisin `/matches`. En production ce fetch tombait donc systématiquement en 404,
 * ce que ces tests verrouillent : l'URL doit rester relative, et toute erreur (statut KO OU
 * exception réseau) doit basculer sur le polling plutôt que de laisser les scores en direct
 * silencieusement cassés.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const pools = [{ id: "pool-1", name: "Poule A", players: [{ id: "p1", player_name: "Alan" }] }];

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ScoreBoard — jeton Mercure demandé en local, jamais sur SterPlatform", () => {
  it("appelle la route DartsOpen relative, sans domaine absolu ni en-tête d'organisation", async () => {
    // MERCURE_URL est lu une seule fois au chargement du module (comme ConsoleAutoRefresh) :
    // il faut réinitialiser les modules et réimporter dynamiquement pour que la valeur stubée
    // soit prise en compte.
    vi.stubEnv("NEXT_PUBLIC_MERCURE_PUBLIC_URL", "http://localhost:9090/.well-known/mercure");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://sterplatform.example.com");
    vi.resetModules();
    const { ScoreBoard } = await import("./ScoreBoard") as { ScoreBoard: typeof ScoreBoardType };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "tok", topic: "topic" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ScoreBoard tournamentId="t1" pools={pools} finishedMatches={[]} />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Un seul argument (l'URL relative) : jamais le domaine SterPlatform, jamais l'en-tête
    // X-Organization-Slug (qui n'a de sens que pour un appel cross-service).
    expect(fetchMock).toHaveBeenCalledWith("/api/public/tournaments/t1/mercure-token");
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});

describe("ScoreBoard — repli sur le polling si le jeton Mercure échoue", () => {
  it("bascule sur le polling quand le fetch du jeton lève une exception réseau (pas seulement un statut KO)", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_MERCURE_PUBLIC_URL", "http://localhost:9090/.well-known/mercure");
    vi.resetModules();
    const { ScoreBoard } = await import("./ScoreBoard") as { ScoreBoard: typeof ScoreBoardType };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("mercure-token")) return Promise.reject(new Error("réseau coupé"));
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ScoreBoard tournamentId="t1" pools={pools} finishedMatches={[]} />);
    // Laisse le rejet de connect() être capté par le try/catch avant d'avancer les timers.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/public/tournaments/t1/mercure-token"));

    expect(FakeEventSource.instances).toHaveLength(0);

    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    // Le repli polling doit bien rappeler /matches — sans le catch, cette exception restait une
    // rejection non gérée et startPolling() n'était jamais atteint.
    expect(fetchMock).toHaveBeenCalledWith("/api/public/tournaments/t1/matches");
  });
});
