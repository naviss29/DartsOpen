import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/api/organizations", () => ({ getPaymentAuthorization: vi.fn() }));

const { dbGetOrganization } = await import("@/lib/db/tournament");
const { getPaymentAuthorization } = await import("@/lib/api/organizations");
const { isOnlinePaymentAllowed, getOnlinePaymentUiState, wantsOnlinePayment } = await import("./onlinePaymentGuard");

function paymentAuthorization(overrides: Partial<{ status: string; canReceivePayments: boolean }> = {}) {
  return {
    status: "OPERATIONAL",
    statusLabel: "Opérationnel",
    canReceivePayments: true,
    reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(dbGetOrganization).mockReset();
  vi.mocked(getPaymentAuthorization).mockReset();
});

describe("wantsOnlinePayment", () => {
  it("vrai uniquement pour payment_mode ONLINE + entry_fee positif", () => {
    expect(wantsOnlinePayment({ payment_mode: "ONLINE", entry_fee: 1000 })).toBe(true);
  });

  it("faux pour payment_mode ONLINE + entry_fee à 0 (tournoi gratuit, aucun Stripe requis)", () => {
    expect(wantsOnlinePayment({ payment_mode: "ONLINE", entry_fee: 0 })).toBe(false);
  });

  it("faux pour payment_mode ONSITE même avec un entry_fee positif (droits réglés sur place, jamais de checkout Stripe — indépendant de registration_mode, mission §5/§6)", () => {
    expect(wantsOnlinePayment({ payment_mode: "ONSITE", entry_fee: 1000 })).toBe(false);
  });
});

describe("isOnlinePaymentAllowed", () => {
  it("refuse (NO_ORGANIZATION) sans appeler SterPlatform quand aucune organisation n'est liée", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: null } as never);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "NO_ORGANIZATION" });
    expect(getPaymentAuthorization).not.toHaveBeenCalled();
  });

  it("refuse (STRIPE_NOT_OPERATIONAL) quand le statut SterPlatform n'est pas OPERATIONAL", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(
      paymentAuthorization({ status: "ONBOARDING_INCOMPLETE", canReceivePayments: false }) as never
    );

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("refuse (STRIPE_NOT_OPERATIONAL) quand aucun compte Stripe n'existe (SterPlatform renvoie null)", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(null);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("refuse (repli prudent) si l'appel SterPlatform échoue plutôt que d'autoriser implicitement", async () => {
    // getPaymentAuthorization() journalise et renvoie null en interne — jamais une exception
    // qui remonte jusqu'ici (voir son propre docblock, DARTSOPEN-MONETIZATION-001).
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(null);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: false, reason: "STRIPE_NOT_OPERATIONAL" });
  });

  it("autorise uniquement quand canReceivePayments est explicitement true (status OPERATIONAL)", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(paymentAuthorization() as never);

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result).toEqual({ allowed: true });
  });

  it("ne déduit jamais l'autorisation de la seule présence d'un compte Stripe", async () => {
    // Un compte existe (status non NO_ACCOUNT) mais n'est pas opérationnel (ex. RESTRICTED) :
    // ne doit jamais être traité comme autorisé.
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(
      paymentAuthorization({ status: "RESTRICTED", canReceivePayments: false }) as never
    );

    const result = await isOnlinePaymentAllowed("user-1");

    expect(result.allowed).toBe(false);
  });
});

describe("getOnlinePaymentUiState", () => {
  it("reflète canReceivePayments, le statut OPERATIONAL et le slug pour l'affichage", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(paymentAuthorization() as never);

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ status: "OPERATIONAL", canReceivePayments: true, organizationSlug: "club-a" });
  });

  it("statut NOT_OPERATIONAL, organizationSlug null et canReceivePayments false sans organisation liée", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue(null);

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ status: "NOT_OPERATIONAL", canReceivePayments: false, organizationSlug: null });
  });

  it("statut NOT_OPERATIONAL (déterminé) quand SterPlatform répond mais le compte n'est pas opérationnel", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(
      paymentAuthorization({ status: "ONBOARDING_INCOMPLETE", canReceivePayments: false }) as never
    );

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ status: "NOT_OPERATIONAL", canReceivePayments: false, organizationSlug: "club-a" });
  });

  it("DARTSOPEN-MONETIZATION-002 (audit priorité 4) : statut INDETERMINATE (jamais NOT_OPERATIONAL) quand SterPlatform est injoignable", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getPaymentAuthorization).mockResolvedValue(null);

    const result = await getOnlinePaymentUiState("user-1");

    expect(result).toEqual({ status: "INDETERMINATE", canReceivePayments: false, organizationSlug: "club-a" });
    expect(result.status).not.toBe("NOT_OPERATIONAL");
  });
});
