import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/api/sterplatformInternal", () => ({ getStripeConnectStatus: vi.fn() }));

const { dbGetOrganization } = await import("@/lib/db/tournament");
const { getStripeConnectStatus } = await import("@/lib/api/sterplatformInternal");
const { isOnlinePaymentAllowed, getOnlinePaymentUiState, wantsOnlinePayment } = await import("./onlinePaymentGuard");

function stripeStatus(overrides: Partial<{ status: string; canReceivePayments: boolean }> = {}) {
  return {
    stripeAccountId: "acct_123",
    status: "OPERATIONAL",
    canReceivePayments: true,
    reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(dbGetOrganization).mockReset();
  vi.mocked(getStripeConnectStatus).mockReset();
});

describe("wantsOnlinePayment", () => {
  it("vrai uniquement pour ONLINE + entry_fee positif", () => {
    expect(wantsOnlinePayment({ registration_mode: "ONLINE", entry_fee: 1000 })).toBe(true);
  });

  it("faux pour ONLINE + entry_fee à 0 (inscription en ligne gratuite, aucun Stripe requis)", () => {
    expect(wantsOnlinePayment({ registration_mode: "ONLINE", entry_fee: 0 })).toBe(false);
  });

  it("faux pour ONSITE même avec un entry_fee positif (jamais de checkout Stripe pour ONSITE)", () => {
    expect(wantsOnlinePayment({ registration_mode: "ONSITE", entry_fee: 1000 })).toBe(false);
  });
});

describe("isOnlinePaymentAllowed", () => {
  it("refuse (NO_ORGANIZATION) sans appeler SterPlatform quand aucune organisation n'est liée", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: null } as never);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "NO_ORGANIZATION" });
    expect(getStripeConnectStatus).not.toHaveBeenCalled();
  });

  it("refuse (STRIPE_NOT_OPERATIONAL) quand le statut SterPlatform n'est pas OPERATIONAL", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(
      stripeStatus({ status: "ONBOARDING_INCOMPLETE", canReceivePayments: false }) as never
    );

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("refuse (STRIPE_NOT_OPERATIONAL) quand aucun compte Stripe n'existe (SterPlatform renvoie null)", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(null);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("refuse (repli prudent) si l'appel SterPlatform échoue plutôt que d'autoriser implicitement", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockRejectedValue(new Error("network down"));

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("autorise uniquement quand canReceivePayments est explicitement true (status OPERATIONAL)", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: true });
  });

  it("ne déduit jamais l'autorisation de la seule présence d'un stripeAccountId", async () => {
    // Un compte existe (stripeAccountId non vide) mais n'est pas opérationnel (ex. RESTRICTED) :
    // ne doit jamais être traité comme autorisé.
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(
      stripeStatus({ status: "RESTRICTED", canReceivePayments: false }) as never
    );

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result.allowed).toBe(false);
  });
});

describe("getOnlinePaymentUiState", () => {
  it("reflète canReceivePayments et le slug pour l'affichage", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ canReceivePayments: true, organizationSlug: "club-a" });
  });

  it("organizationSlug null et canReceivePayments false sans organisation liée", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue(null);

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ canReceivePayments: false, organizationSlug: null });
  });
});
