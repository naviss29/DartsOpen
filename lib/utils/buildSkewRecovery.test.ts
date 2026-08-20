import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isBuildSkewError,
  attemptBuildSkewRecovery,
  hasAttemptedBuildSkewRecovery,
  clearBuildSkewRecoveryGuard,
} from "./buildSkewRecovery";

/**
 * DO-STABILIZATION-001 (Problème 3) — détection/récupération d'un "Server Action introuvable"
 * après déploiement (build skew). `window.sessionStorage`/`window.location.reload` sont
 * disponibles nativement dans l'environnement jsdom de ce projet (vitest.config.ts,
 * environment: "jsdom") — seul `reload()` doit être remplacé (jsdom lève une erreur "not
 * implemented" sur la navigation réelle).
 */

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("isBuildSkewError", () => {
  it("reconnaît le message exact 'Server Action \"...\" was not found on the server'", () => {
    expect(isBuildSkewError(new Error('Server Action "40a89228e51116187d68490f2d918cd3c9b1a582" was not found on the server.'))).toBe(true);
  });

  it("reconnaît 'Failed to find Server Action'", () => {
    expect(isBuildSkewError(new Error("Failed to find Server Action for id"))).toBe(true);
  });

  it("reconnaît ChunkLoadError", () => {
    expect(isBuildSkewError(new Error("ChunkLoadError: Loading chunk 42 failed."))).toBe(true);
  });

  it("reconnaît une chaîne brute (pas seulement une instance Error)", () => {
    expect(isBuildSkewError("Server Action \"abc123\" was not found on the server.")).toBe(true);
  });

  it("ne confond jamais une erreur métier normale avec un build skew", () => {
    expect(isBuildSkewError(new Error("Vous ne participez pas à ce match."))).toBe(false);
    expect(isBuildSkewError(new Error("Erreur lors de l'enregistrement de la volée."))).toBe(false);
  });

  it("gère une entrée vide/inattendue sans jamais lever", () => {
    expect(isBuildSkewError(null)).toBe(false);
    expect(isBuildSkewError(undefined)).toBe(false);
    expect(isBuildSkewError({})).toBe(false);
  });
});

describe("attemptBuildSkewRecovery — une seule tentative, jamais de boucle", () => {
  it("déclenche un rechargement pour une erreur de build skew, une seule fois", () => {
    const reloadSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload: reloadSpy } as unknown as Location);

    const first = attemptBuildSkewRecovery(new Error('Server Action "abc" was not found on the server.'));
    expect(first).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Un second appel — même dans un composant remonté après le rechargement raté à intercepter
    // par jsdom, ou un second render avant que la navigation réelle n'ait eu lieu — ne doit
    // jamais redéclencher un second reload : le garde-fou sessionStorage bloque la boucle.
    const second = attemptBuildSkewRecovery(new Error('Server Action "abc" was not found on the server.'));
    expect(second).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("ne déclenche jamais de rechargement pour une erreur qui n'a pas la forme d'un build skew", () => {
    const reloadSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload: reloadSpy } as unknown as Location);

    const result = attemptBuildSkewRecovery(new Error("Erreur métier normale."));

    expect(result).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe("hasAttemptedBuildSkewRecovery — lecture pure, jamais d'écriture ni de rechargement", () => {
  it("faux avant toute tentative", () => {
    expect(hasAttemptedBuildSkewRecovery()).toBe(false);
  });

  it("vrai après une tentative de récupération", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({ reload: vi.fn() } as unknown as Location);
    attemptBuildSkewRecovery(new Error('Server Action "abc" was not found on the server.'));

    expect(hasAttemptedBuildSkewRecovery()).toBe(true);
  });
});

describe("clearBuildSkewRecoveryGuard — permet une nouvelle tentative lors d'un futur déploiement", () => {
  it("efface le garde-fou : un nouveau build skew redéclenche un rechargement", () => {
    const reloadSpy = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload: reloadSpy } as unknown as Location);

    attemptBuildSkewRecovery(new Error('Server Action "abc" was not found on the server.'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    clearBuildSkewRecoveryGuard();
    expect(hasAttemptedBuildSkewRecovery()).toBe(false);

    attemptBuildSkewRecovery(new Error('Server Action "def" was not found on the server.'));
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });
});
