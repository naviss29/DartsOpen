import { describe, it, expect, vi, beforeEach } from "vitest";

// DO-PAYMENT-GUARD-001 §5 — garde-fou au plus près de la création réelle du paiement :
// même si un tournoi (historique ou incohérent) est configuré en paiement en ligne, aucun
// checkout ne doit être créé si Stripe Connect n'est plus opérationnel au moment de
// l'inscription.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/api/sterplatform", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/api/sterplatformInternal", () => ({
  createPaymentCheckout: vi.fn(),
  getStripeConnectStatus: vi.fn(),
}));
vi.mock("@/lib/db/tournament", () => ({
  dbGetTournament: vi.fn(),
  dbCountRegistrations: vi.fn(),
  dbAddRegistration: vi.fn(),
  dbUpdateRegistrationPaymentId: vi.fn(),
  dbGetOrganization: vi.fn(),
}));

const { createRegistration } = await import("./registration");
const { createPaymentCheckout, getStripeConnectStatus } = await import("@/lib/api/sterplatformInternal");
const {
  dbGetTournament,
  dbCountRegistrations,
  dbAddRegistration,
  dbUpdateRegistrationPaymentId,
  dbGetOrganization,
} = await import("@/lib/db/tournament");
const { redirect } = await import("next/navigation");

function paidTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "tournament-1",
    association_id: "user-1",
    status: "OPEN",
    entry_fee: 1000,
    payment_mode: "ONLINE",
    players_per_team: 2,
    max_players: 32,
    name: "Open de fléchettes",
    date: "2026-06-15",
    location: "Salle des fêtes",
    ...overrides,
  };
}

function stripeStatus(overrides: Partial<{ status: string; canReceivePayments: boolean }> = {}) {
  return { stripeAccountId: "acct_123", status: "OPERATIONAL", canReceivePayments: true, reason: null, ...overrides };
}

beforeEach(() => {
  vi.mocked(dbGetTournament).mockReset();
  vi.mocked(dbCountRegistrations).mockReset().mockResolvedValue(0);
  vi.mocked(dbAddRegistration).mockReset().mockResolvedValue({ id: "registration-1" } as never);
  vi.mocked(dbUpdateRegistrationPaymentId).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(dbGetOrganization).mockReset();
  vi.mocked(getStripeConnectStatus).mockReset();
  vi.mocked(createPaymentCheckout).mockReset();
  vi.mocked(redirect).mockClear();
});

describe("createRegistration — garde-fou checkout (DO-PAYMENT-GUARD-001 §5)", () => {
  it("7. Stripe désactivé après création d'un tournoi payable : nouveau checkout refusé", async () => {
    // Le tournoi est bien configuré en paiement en ligne (entry_fee > 0), et l'organisation
    // est toujours liée — mais Stripe n'est plus opérationnel (suspendu après coup).
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(
      stripeStatus({ status: "RESTRICTED", canReceivePayments: false }) as never
    );

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toBeDefined();
    expect(createPaymentCheckout).not.toHaveBeenCalled();
    expect(dbUpdateRegistrationPaymentId).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("relit toujours l'état Stripe courant depuis SterPlatform, jamais une valeur mise en cache", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(createPaymentCheckout).mockResolvedValue({
      checkout: { paymentId: "pay_1", checkoutUrl: "https://checkout.example/pay_1", status: "PENDING" },
    } as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(getStripeConnectStatus).toHaveBeenCalledWith("club-a");
    expect(createPaymentCheckout).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("https://checkout.example/pay_1");
  });

  it("refuse (repli prudent) si l'appel de statut Stripe échoue, plutôt que d'autoriser le paiement", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockRejectedValue(new Error("network down"));

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toBeDefined();
    expect(createPaymentCheckout).not.toHaveBeenCalled();
  });

  it("un tournoi gratuit (entry_fee = 0) n'interroge jamais le statut Stripe", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(getStripeConnectStatus).not.toHaveBeenCalled();
    expect(createPaymentCheckout).not.toHaveBeenCalled();
  });

  it("aucune organisation liée : refusé avant même d'interroger Stripe", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: null } as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toBeDefined();
    expect(getStripeConnectStatus).not.toHaveBeenCalled();
    expect(createPaymentCheckout).not.toHaveBeenCalled();
  });
});

describe("createRegistration — payment_mode indépendant de registration_mode (DARTSOPEN-MONETIZATION-001, mission §5/§6/§7)", () => {
  it("payment_mode ONSITE + entry_fee positif : confirme immédiatement, sans jamais interroger Stripe (droits réglés sur place)", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ payment_mode: "ONSITE" }) as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(getStripeConnectStatus).not.toHaveBeenCalled();
    expect(createPaymentCheckout).not.toHaveBeenCalled();
    expect(dbGetOrganization).not.toHaveBeenCalled();
  });

  it("Stripe absent + droits d'inscription positifs : l'inscription reste valide (jamais forcée à 0€, mission §7)", async () => {
    // Aucun compte Stripe Connect (dbGetOrganization jamais interrogé pour ce chemin) — le
    // tournoi est simplement payé sur place, exactement comme un tournoi gratuit du point de
    // vue du flux d'inscription.
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ payment_mode: "ONSITE", entry_fee: 500 }) as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(dbAddRegistration).toHaveBeenCalledTimes(1);
  });
});
