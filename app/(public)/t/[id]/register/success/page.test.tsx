import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { catalogs, translate, type MessageKey } from "@/lib/i18n/catalogs";

// Recette du 29/10/2026 : la confirmation parlait de « scanner le QR code » même en saisie
// traditionnelle, et de « l'équipe » pour un joueur seul. Vraie page, vrai catalogue français.

const h = vi.hoisted(() => ({ tournament: vi.fn(), payment: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({ dbGetTournamentPublic: h.tournament }));
vi.mock("@/lib/db/registrationPaymentStatus", () => ({ dbGetRegistrationPaymentStatus: h.payment }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
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
  h.payment.mockReset();
  h.refresh.mockReset();
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

// Règle n° 2 de bapps-payments : le retour navigateur depuis Stripe ne prouve jamais un paiement.
// La page relit l'état réel de l'inscription ; seul le webhook (PAID) la fait passer à « confirmée ».
describe("retour de paiement en ligne — l'état réel, jamais le retour navigateur", () => {
  const REG_ID = "11111111-2222-4333-8444-555555555555";
  const fr = catalogs.fr;

  async function renderOnline(payment: unknown, { inscription }: { inscription?: string } = { inscription: REG_ID }) {
    h.tournament.mockResolvedValue({ players_per_team: 1, scoring_mode: "TRADITIONAL", quick_mode: false });
    if (payment instanceof Error) h.payment.mockRejectedValue(payment);
    else h.payment.mockResolvedValue(payment);
    const { container } = render(
      await RegisterSuccessPage({
        params: Promise.resolve({ id: "t1" }),
        searchParams: Promise.resolve({ name: "Alex", paiement: "en-ligne", inscription }),
      }),
    );
    return { text: container.textContent ?? "", container };
  }

  it("retour AVANT le webhook : « Paiement en cours de confirmation », jamais « confirmée » ni « encaissé »", async () => {
    const { text } = await renderOnline({ status: "PENDING", reservationExpiresAt: new Date(Date.now() + 20 * 60_000) });
    expect(h.payment).toHaveBeenCalledWith(REG_ID, "t1");
    expect(text).toContain(fr["registerSuccess.pendingTitle"]);
    expect(text).toContain(fr["registerSuccess.pendingBody"]);
    expect(text).not.toContain(fr["registerSuccess.title"]);
    expect(text).not.toContain(fr["registerSuccess.paidOnline"]);
    expect(text).not.toContain("Inscription enregistrée pour Alex.");
  });

  it("retour APRÈS le webhook : « Inscription confirmée », message joueur seul et conseil du jour J conservés", async () => {
    const { text } = await renderOnline({ status: "PAID", reservationExpiresAt: null });
    expect(text).toContain(fr["registerSuccess.title"]);
    expect(text).toContain(fr["registerSuccess.paidOnline"]);
    expect(text).toContain("Inscription enregistrée pour Alex.");
    expect(text).not.toMatch(/équipe|QR/i);
    expect(text).toContain(fr["registerSuccess.organizerScoringHint"]);
    expect(text).not.toContain(fr["registerSuccess.pendingTitle"]);
  });

  it("échec : réservation expirée sans confirmation → « Paiement non abouti » et lien pour recommencer", async () => {
    const { text, container } = await renderOnline({ status: "PENDING", reservationExpiresAt: new Date(Date.now() - 60_000) });
    expect(text).toContain(fr["registerSuccess.failedTitle"]);
    expect(text).toContain(fr["registerSuccess.expiredBody"]);
    expect(text).not.toContain(fr["registerSuccess.title"]);
    expect(container.querySelector('a[href="/t/t1/register"]')?.textContent).toBe(fr["registerSuccess.retry"]);
  });

  it("échec : inscription annulée → « Paiement non abouti »", async () => {
    const { text } = await renderOnline({ status: "CANCELLED", reservationExpiresAt: null });
    expect(text).toContain(fr["registerSuccess.failedTitle"]);
    expect(text).toContain(fr["registerSuccess.failedBody"]);
  });

  it("paiement arrivé trop tard (remboursement) : inscription non retenue", async () => {
    const { text } = await renderOnline({ status: "REFUND_PENDING", reservationExpiresAt: null });
    expect(text).toContain(fr["registerSuccess.refundedTitle"]);
    expect(text).not.toContain(fr["registerSuccess.title"]);
  });

  it("ancien lien sans identifiant : neutre, aucune lecture en base, jamais « confirmée »", async () => {
    const { text } = await renderOnline(null, {});
    expect(h.payment).not.toHaveBeenCalled();
    expect(text).toContain(fr["registerSuccess.pendingByEmail"]);
    expect(text).not.toContain(fr["registerSuccess.title"]);
  });

  it("base indisponible : neutre et journalisé, jamais « confirmée »", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { text } = await renderOnline(new Error("base indisponible"));
    expect(text).toContain(fr["registerSuccess.pendingByEmail"]);
    expect(text).not.toContain(fr["registerSuccess.title"]);
    expect(errorSpy).toHaveBeenCalled();
  });
});
