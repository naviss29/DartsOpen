import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_API_URL = "https://sterplatform.test";
process.env.STER_API_TOKEN = "server-token";

// Import dynamique : API_URL / API_TOKEN sont lus dans des constantes de module au chargement.
const { getStripeConnectStatus, createPaymentCheckout } = await import("./sterplatformInternal");

describe("getStripeConnectStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("retourne le statut OPERATIONAL — paiement autorisé", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          stripeAccountId: "acct_123",
          status: "OPERATIONAL",
          canReceivePayments: true,
          reason: null,
        }),
        { status: 200 }
      )
    );
    const result = await getStripeConnectStatus("dartsopen-club");
    expect(result?.canReceivePayments).toBe(true);
    expect(result?.status).toBe("OPERATIONAL");
    expect(fetch).toHaveBeenCalledWith(
      "https://sterplatform.test/api/internal/organizations/dartsopen-club/connect/account-id",
      expect.objectContaining({ headers: expect.objectContaining({ "X-App-Token": "server-token" }) })
    );
  });

  it("retourne un statut non-opérationnel — paiement refusé (onboarding incomplet)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          stripeAccountId: "acct_123",
          status: "ONBOARDING_INCOMPLETE",
          canReceivePayments: false,
          reason: "Informations manquantes",
        }),
        { status: 200 }
      )
    );
    const result = await getStripeConnectStatus("dartsopen-club");
    expect(result?.canReceivePayments).toBe(false);
    expect(result?.status).toBe("ONBOARDING_INCOMPLETE");
  });

  it("retourne null en l'absence de compte Stripe Connect (404)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const result = await getStripeConnectStatus("dartsopen-club");
    expect(result).toBeNull();
  });

  it("lève une erreur sur une panne serveur SterPlatform (5xx distinct de l'absence de compte)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getStripeConnectStatus("dartsopen-club")).rejects.toThrow();
  });

  it("encode le slug de l'organisation dans l'URL", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await getStripeConnectStatus("club été 2026");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("club été 2026")),
      expect.anything()
    );
  });
});

describe("createPaymentCheckout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  const params = {
    organizationSlug: "dartsopen-club",
    externalReference: "registration-1",
    amountCents: 2000,
    currency: "eur",
    platformFeeCents: 20,
    successUrl: "https://dartsopen.test/success",
    cancelUrl: "https://dartsopen.test/cancel",
  };

  it("retourne le checkout créé sur une réponse 2xx", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ paymentId: "payment-1", checkoutUrl: "https://checkout.stripe.test/x", status: "PENDING" }),
        { status: 200 }
      )
    );
    const result = await createPaymentCheckout(params);
    expect(result.checkout?.paymentId).toBe("payment-1");
    expect(result.error).toBeUndefined();

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(options!.body as string);
    expect(body.product).toBe("DARTSOPEN");
    expect(body.amountCents).toBe(2000);
  });

  it("retourne une erreur explicite si le paiement est refusé côté SterPlatform", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Compte Stripe Connect non opérationnel" }), { status: 422 })
    );
    const result = await createPaymentCheckout(params);
    expect(result.checkout).toBeUndefined();
    expect(result.error).toBe("Compte Stripe Connect non opérationnel");
  });

  it("retourne une erreur générique si le corps d'erreur n'est pas du JSON exploitable", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    const result = await createPaymentCheckout(params);
    expect(result.checkout).toBeUndefined();
    expect(result.error).toContain("500");
  });
});
