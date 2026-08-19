import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// DO-OPS-002 (défaut 6, scénarios obligatoires 14/15) — si le composant est démonté PENDANT le
// fetch async du jeton Mercure, la promesse peut se résoudre APRÈS le nettoyage de l'effet
// (qui n'avait alors rien à fermer, `es`/`poll` étant encore `null`) : sans le flag `mounted`
// vérifié après chaque `await`, un EventSource seraît créé (et jamais fermé) longtemps après le
// démontage. `MERCURE_URL` est lu une seule fois au chargement du module : chaque test qui a
// besoin d'une valeur différente réinitialise les modules et réimporte dynamiquement.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

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

beforeEach(() => {
  refreshMock.mockReset();
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ConsoleAutoRefresh — aucun EventSource créé après démontage pendant le fetch du jeton", () => {
  it("le composant démonté avant la résolution du fetch ne crée jamais d'EventSource ni n'appelle router.refresh()", async () => {
    process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL = "http://localhost:9090/.well-known/mercure";
    vi.resetModules();
    const { ConsoleAutoRefresh } = await import("./ConsoleAutoRefresh");

    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve as never;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<ConsoleAutoRefresh tournamentId="t1" />);
    expect(fetchMock).toHaveBeenCalledWith("/api/public/tournaments/t1/mercure-token");

    // Démontage AVANT que le fetch async ne se résolve — c'est exactement la fenêtre de course.
    unmount();

    resolveFetch({ ok: true, json: async () => ({ token: "tok", topic: "topic" }) });
    // Laisse les micro-tâches (les deux `await` de connect()) s'exécuter.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("un composant resté monté crée bien un EventSource et relaie ses messages à router.refresh()", async () => {
    process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL = "http://localhost:9090/.well-known/mercure";
    vi.resetModules();
    const { ConsoleAutoRefresh } = await import("./ConsoleAutoRefresh");

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "tok", topic: "topic" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConsoleAutoRefresh tournamentId="t1" />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].onmessage?.();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("ConsoleAutoRefresh — repli polling nettoyé au démontage (scénario obligatoire 15)", () => {
  it("sans Mercure configuré, le polling démarre puis est nettoyé au démontage (plus aucun refresh après)", async () => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL = "";
    vi.resetModules();
    const { ConsoleAutoRefresh } = await import("./ConsoleAutoRefresh");

    const { unmount } = render(<ConsoleAutoRefresh tournamentId="t1" intervalMs={1000} />);

    await vi.advanceTimersByTimeAsync(2500);
    expect(refreshMock).toHaveBeenCalledTimes(2);

    unmount();
    refreshMock.mockClear();

    await vi.advanceTimersByTimeAsync(5000);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
