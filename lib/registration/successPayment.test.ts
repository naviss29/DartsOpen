import { describe, expect, it } from "vitest";
import { dayOfMessageKey, immediatePaymentKind, onlinePaymentMessages, onlinePaymentState, registeredMessageKey, successPaymentMessageKey } from "./successPayment";

describe("immediatePaymentKind", () => {
  it("tournoi payant confirmé sans checkout = réglé sur place", () => {
    expect(immediatePaymentKind(500)).toBe("sur-place");
  });

  it("tournoi gratuit = gratuit", () => {
    expect(immediatePaymentKind(0)).toBe("gratuit");
  });
});

describe("successPaymentMessageKey", () => {
  it("n'annonce un encaissement que pour un paiement en ligne", () => {
    expect(successPaymentMessageKey("en-ligne")).toBe("registerSuccess.paidOnline");
  });

  it("rappelle le règlement sur place", () => {
    expect(successPaymentMessageKey("sur-place")).toBe("registerSuccess.payOnSite");
  });

  it.each([undefined, "gratuit", "n'importe-quoi"])("reste neutre pour %s", (kind) => {
    expect(successPaymentMessageKey(kind)).toBe("registerSuccess.seeYou");
  });
});

describe("registeredMessageKey — joueur seul ou équipe (recette 29/10/2026)", () => {
  it("parle d'équipe seulement à partir de deux joueurs", () => {
    expect(registeredMessageKey({ players_per_team: 2, scoring_mode: "ELECTRONIC" })).toBe("registerSuccess.team");
    expect(registeredMessageKey({ players_per_team: 1, scoring_mode: "ELECTRONIC" })).toBe("registerSuccess.player");
  });

  it("formule neutre si le tournoi est illisible", () => {
    expect(registeredMessageKey(null)).toBe("registerSuccess.player");
  });
});

describe("dayOfMessageKey — conseil du jour J selon le mode de saisie (recette 29/10/2026)", () => {
  it("QR code seulement en saisie électronique", () => {
    expect(dayOfMessageKey({ players_per_team: 1, scoring_mode: "ELECTRONIC" })).toBe("registerSuccess.scanHint");
  });

  it("saisie traditionnelle : pas de QR code", () => {
    expect(dayOfMessageKey({ players_per_team: 1, scoring_mode: "TRADITIONAL" })).toBe("registerSuccess.organizerScoringHint");
  });

  it("mode rapide : pas de QR code, quel que soit le mode de saisie enregistré", () => {
    expect(dayOfMessageKey({ players_per_team: 1, scoring_mode: "ELECTRONIC", quick_mode: true })).toBe("registerSuccess.organizerScoringHint");
  });

  it("aucun conseil si le tournoi est illisible", () => {
    expect(dayOfMessageKey(null)).toBeNull();
  });
});

describe("onlinePaymentState — le retour navigateur ne prouve jamais un paiement", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const later = new Date("2026-10-29T12:30:00Z");
  const earlier = new Date("2026-10-29T11:30:00Z");

  it("retour avant le webhook : en attente tant que la réservation court", () => {
    expect(onlinePaymentState({ status: "PENDING", reservationExpiresAt: later }, now)).toBe("pending");
    expect(onlinePaymentState({ status: "PENDING", reservationExpiresAt: null }, now)).toBe("pending");
  });

  it("retour après le webhook : confirmé uniquement pour PAID", () => {
    expect(onlinePaymentState({ status: "PAID", reservationExpiresAt: null }, now)).toBe("confirmed");
  });

  it("échec : réservation expirée, inscription annulée", () => {
    expect(onlinePaymentState({ status: "PENDING", reservationExpiresAt: earlier }, now)).toBe("expired");
    expect(onlinePaymentState({ status: "CANCELLED", reservationExpiresAt: null }, now)).toBe("failed");
  });

  it("paiement arrivé trop tard : remboursement", () => {
    expect(onlinePaymentState({ status: "REFUND_PENDING", reservationExpiresAt: null }, now)).toBe("refunded");
    expect(onlinePaymentState({ status: "REFUNDED", reservationExpiresAt: null }, now)).toBe("refunded");
  });

  it("inscription introuvable ou statut inconnu : neutre", () => {
    expect(onlinePaymentState(null, now)).toBe("unknown");
    expect(onlinePaymentState({ status: "AUTRE", reservationExpiresAt: null }, now)).toBe("unknown");
  });
});

describe("onlinePaymentMessages", () => {
  it("« Inscription confirmée » et « encaissé » seulement une fois confirmé", () => {
    expect(onlinePaymentMessages("confirmed")).toEqual({ title: "registerSuccess.title", body: "registerSuccess.paidOnline" });
    for (const state of ["pending", "expired", "failed", "refunded", "unknown"] as const) {
      const m = onlinePaymentMessages(state);
      expect(m.title).not.toBe("registerSuccess.title");
      expect(m.body).not.toBe("registerSuccess.paidOnline");
    }
  });

  it("échec et expiration sont annoncés comme tels", () => {
    expect(onlinePaymentMessages("failed").title).toBe("registerSuccess.failedTitle");
    expect(onlinePaymentMessages("expired")).toEqual({ title: "registerSuccess.failedTitle", body: "registerSuccess.expiredBody" });
  });
});
