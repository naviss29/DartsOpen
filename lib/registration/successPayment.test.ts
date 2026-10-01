import { describe, expect, it } from "vitest";
import { immediatePaymentKind, successPaymentMessageKey } from "./successPayment";

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
