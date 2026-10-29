import { describe, expect, it } from "vitest";
import { dayOfMessageKey, immediatePaymentKind, registeredMessageKey, successPaymentMessageKey } from "./successPayment";

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
