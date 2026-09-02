import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardError from "./error";

/**
 * DO-STABILIZATION-001 (Problème 3) — vérifie le comportement RENDU du error boundary, pas
 * seulement la fonction pure sous-jacente (buildSkewRecovery.test.ts) : une erreur de build
 * skew ne doit jamais afficher le message technique brut, une autre erreur doit garder le
 * comportement existant intact.
 */

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(window, "location", "get").mockReturnValue({ reload: vi.fn() } as unknown as Location);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("(dashboard)/error.tsx", () => {
  it("build skew : n'affiche jamais le message technique brut, montre un état de mise à jour", () => {
    const error = Object.assign(new Error('Server Action "40a89228e51116187d68490f2d918cd3c9b1a582" was not found on the server.'), { digest: "x" });
    render(<DashboardError error={error} reset={() => {}} />);

    expect(screen.queryByText(/server action/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mise à jour disponible/i)).toBeInTheDocument();
  });

  it("erreur applicative normale : comportement inchangé, message affiché, jamais masqué", () => {
    const error = Object.assign(new Error("Vous ne participez pas à ce match."), { digest: "y" });
    render(<DashboardError error={error} reset={() => {}} />);

    expect(screen.getByText(/une erreur est survenue/i)).toBeInTheDocument();
    expect(screen.getByText(/vous ne participez pas à ce match/i)).toBeInTheDocument();
    expect(screen.queryByText(/mise à jour disponible/i)).not.toBeInTheDocument();
  });

  it("erreur réseau (fetch échoué, ex. hors ligne) : jamais le message technique brut du navigateur, un message compréhensible à la place", () => {
    const error = Object.assign(new Error("Failed to fetch"), { digest: "w" });
    render(<DashboardError error={error} reset={() => {}} />);

    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(screen.getByText(/connexion impossible/i)).toBeInTheDocument();
    expect(screen.getByText(/vérifiez votre connexion internet/i)).toBeInTheDocument();
  });

  it("le bouton Réessayer appelle reset()", () => {
    const error = Object.assign(new Error("Erreur normale."), { digest: "z" });
    const reset = vi.fn();
    render(<DashboardError error={error} reset={reset} />);

    screen.getByRole("button", { name: /réessayer/i }).click();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
