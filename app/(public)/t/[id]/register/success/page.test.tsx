import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { catalogs, translate, type MessageKey } from "@/lib/i18n/catalogs";

// Recette du 29/10/2026 : la confirmation parlait de « scanner le QR code » même en saisie
// traditionnelle, et de « l'équipe » pour un joueur seul. Vraie page, vrai catalogue français.

const h = vi.hoisted(() => ({ tournament: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({ dbGetTournamentPublic: h.tournament }));
vi.mock("@/lib/i18n/server", () => ({
  getI18n: async () => ({ t: (key: MessageKey, values?: Record<string, string | number>) => translate(catalogs.fr, key, values) }),
}));

import RegisterSuccessPage from "./page";

async function renderFor(tournament: unknown) {
  h.tournament.mockResolvedValue(tournament);
  const { container } = render(
    await RegisterSuccessPage({ params: Promise.resolve({ id: "t1" }), searchParams: Promise.resolve({ name: "Alex", paiement: "gratuit" }) }),
  );
  return container.textContent ?? "";
}

// Accolades : une fonction renvoyée par beforeEach serait exécutée comme nettoyage par Vitest.
beforeEach(() => {
  h.tournament.mockReset();
});

describe("confirmation d'inscription — message adapté au tournoi", () => {
  it("joueur seul en saisie traditionnelle : ni équipe, ni QR code", async () => {
    const text = await renderFor({ players_per_team: 1, scoring_mode: "TRADITIONAL", quick_mode: false });
    expect(text).toContain("Inscription enregistrée pour Alex.");
    expect(text).not.toMatch(/équipe/i);
    expect(text).not.toMatch(/QR/);
    expect(text).toContain(catalogs.fr["registerSuccess.organizerScoringHint"]);
  });

  it("équipe en saisie électronique : équipe et QR code", async () => {
    const text = await renderFor({ players_per_team: 2, scoring_mode: "ELECTRONIC", quick_mode: false });
    expect(text).toContain("L’équipe Alex est bien inscrite.");
    expect(text).toContain(catalogs.fr["registerSuccess.scanHint"]);
  });

  it("tournoi illisible : formule neutre, aucun conseil faux", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.tournament.mockImplementation(async () => { throw new Error("base indisponible"); });
    const { container } = render(
      await RegisterSuccessPage({ params: Promise.resolve({ id: "t1" }), searchParams: Promise.resolve({ name: "Alex" }) }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Inscription enregistrée pour Alex.");
    expect(text).not.toMatch(/QR|équipe/i);
    expect(errorSpy).toHaveBeenCalled();
  });
});
