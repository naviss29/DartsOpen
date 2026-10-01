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
  dbReserveRegistrationSlot: vi.fn(),
  dbUpdateRegistrationPaymentId: vi.fn(),
  dbGetOrganization: vi.fn(),
}));
// Parcours public : jamais d'appel /api/me/organizations (pas de JWT) — simulé pour le prouver.
vi.mock("@/lib/auth/organizationAccess", () => ({ getMyMemberships: vi.fn() }));

const { createRegistration } = await import("./registration");
const { createPaymentCheckout, getStripeConnectStatus } = await import("@/lib/api/sterplatformInternal");
const {
  dbGetTournament,
  dbReserveRegistrationSlot,
  dbUpdateRegistrationPaymentId,
  dbGetOrganization,
} = await import("@/lib/db/tournament");
const { redirect } = await import("next/navigation");
const { getMyMemberships } = await import("@/lib/auth/organizationAccess");

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
  vi.mocked(dbReserveRegistrationSlot).mockReset().mockResolvedValue({ outcome: "RESERVED", registration: { id: "registration-1" } } as never);
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
    // DARTSOPEN-MONETIZATION-002 (audit priorité 6) : Connect vérifié AVANT toute réservation —
    // jamais de place réservée pour un paiement qui ne pourra de toute façon pas être initié.
    expect(dbReserveRegistrationSlot).not.toHaveBeenCalled();
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

    expect(dbReserveRegistrationSlot).toHaveBeenCalledTimes(1);
  });
});

describe("createRegistration — capacité atomique (DARTSOPEN-MONETIZATION-002, audit DO-AUD-003/DO-AUD-004)", () => {
  it("confirmation immédiate (gratuit/sur place) : réserve avec le statut PAID, sans expiration", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(dbReserveRegistrationSlot).toHaveBeenCalledTimes(1);
    const [, allowedStatuses, reservation] = vi.mocked(dbReserveRegistrationSlot).mock.calls[0];
    expect(reservation.status).toBe("PAID");
    expect(reservation.reservationExpiresAt).toBeUndefined();
    // DARTSOPEN-MONETIZATION-004 (P4, contre-audit) : l'inscription publique n'autorise jamais
    // un tournoi DRAFT — seul OPEN, revérifié sous le verrou par dbReserveRegistrationSlot lui-même.
    expect(allowedStatuses).toEqual(["OPEN"]);
  });

  it("tournoi complet (confirmation immédiate) : refuse proprement, jamais d'email ni de redirection", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);
    vi.mocked(dbReserveRegistrationSlot).mockResolvedValue({ outcome: "FULL" } as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toMatch(/complet/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("DARTSOPEN-MONETIZATION-004 (P4, contre-audit) : tournoi devenu fermé sous le verrou (NOT_OPEN) : refuse proprement, message distinct de 'complet'", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);
    vi.mocked(dbReserveRegistrationSlot).mockResolvedValue({ outcome: "NOT_OPEN" } as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toMatch(/n'accepte plus/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("BUG-3 recette 01/10 : la page de succès sait si les droits sont à régler sur place, gratuits ou payés en ligne", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ payment_mode: "ONSITE" }) as never);
    await expect(createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])).rejects.toThrow("NEXT_REDIRECT");
    expect(vi.mocked(redirect).mock.calls.at(-1)?.[0]).toContain("&paiement=sur-place");

    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);
    await expect(createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])).rejects.toThrow("NEXT_REDIRECT");
    expect(vi.mocked(redirect).mock.calls.at(-1)?.[0]).toContain("&paiement=gratuit");

    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(createPaymentCheckout).mockResolvedValue({
      checkout: { paymentId: "pay_1", checkoutUrl: "https://checkout.example/pay_1", status: "PENDING" },
    } as never);
    await expect(createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])).rejects.toThrow("NEXT_REDIRECT");
    expect(vi.mocked(createPaymentCheckout).mock.calls[0][0].successUrl).toContain("&paiement=en-ligne");
  });

  it("paiement en ligne : réserve avec le statut PENDING et une expiration future (audit DO-AUD-009 — place réservée pendant le checkout)", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(createPaymentCheckout).mockResolvedValue({
      checkout: { paymentId: "pay_1", checkoutUrl: "https://checkout.example/pay_1", status: "PENDING" },
    } as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(dbReserveRegistrationSlot).toHaveBeenCalledTimes(1);
    const [, , reservation] = vi.mocked(dbReserveRegistrationSlot).mock.calls[0];
    expect(reservation.status).toBe("PENDING");
    expect(reservation.reservationExpiresAt).toBeInstanceOf(Date);
    expect((reservation.reservationExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("tournoi complet (paiement en ligne) : refuse avant même de créer un checkout Stripe", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(dbReserveRegistrationSlot).mockResolvedValue({ outcome: "FULL" } as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toMatch(/complet/i);
    expect(createPaymentCheckout).not.toHaveBeenCalled();
  });

  it("échec de création du checkout Stripe : la réservation PENDING n'est jamais explicitement supprimée (elle expirera d'elle-même, audit DO-AUD-009)", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(createPaymentCheckout).mockResolvedValue({ error: "Stripe indisponible" } as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toBeDefined();
    expect(dbUpdateRegistrationPaymentId).not.toHaveBeenCalled();
  });
});

describe("createRegistration — validation d'entrée (audit pré-recette, S3)", () => {
  it("refuse un email malformé, avant tout accès DB", async () => {
    const result = await createRegistration("tournament-1", "Team A", "pas-un-email", null, ["Alice"]);

    expect(result.error).toMatch(/email/i);
    expect(dbGetTournament).not.toHaveBeenCalled();
  });

  it("refuse un nom d'équipe vide", async () => {
    const result = await createRegistration("tournament-1", "   ", "a@example.com", null, ["Alice"]);

    expect(result.error).toBeDefined();
    expect(dbGetTournament).not.toHaveBeenCalled();
  });

  it("refuse un nom d'équipe de plus de 100 caractères", async () => {
    const result = await createRegistration("tournament-1", "A".repeat(101), "a@example.com", null, ["Alice"]);

    expect(result.error).toBeDefined();
  });

  it("refuse une liste de joueurs vide", async () => {
    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, []);

    expect(result.error).toBeDefined();
  });

  it("refuse un nom de joueur vide dans la liste", async () => {
    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "   "]);

    expect(result.error).toBeDefined();
  });

  it("refuse un téléphone mal formé", async () => {
    const result = await createRegistration("tournament-1", "Team A", "a@example.com", "123", ["Alice"]);

    expect(result.error).toMatch(/téléphone/i);
  });

  it("accepte un téléphone null (non fourni) — la validation passe, l'inscription va jusqu'à la redirection de succès", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament({ entry_fee: 0 }) as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(dbGetTournament).toHaveBeenCalled();
  });
});

describe("createRegistration — ADR-0021 / L7 : checkout sur l'organisation du tournoi", () => {
  function organizationTournament(overrides: Record<string, unknown> = {}) {
    return paidTournament({ organization_id: "org-uuid-1", organization_slug: "club-orga", ...overrides });
  }

  it("tournoi rattaché : statut Stripe et checkout sur l'organisation du tournoi, même sans liaison locale du créateur (BUG-4)", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(organizationTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue(null);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus() as never);
    vi.mocked(createPaymentCheckout).mockResolvedValue({
      checkout: { paymentId: "pay_1", checkoutUrl: "https://checkout.example/pay_1", status: "PENDING" },
    } as never);

    await expect(
      createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"])
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(getStripeConnectStatus).toHaveBeenCalledWith("club-orga");
    expect(vi.mocked(createPaymentCheckout).mock.calls[0][0].organizationSlug).toBe("club-orga");
    expect(dbGetOrganization).not.toHaveBeenCalled();
    // Joueur anonyme : aucune lecture des appartenances (pas de JWT sur ce parcours).
    expect(getMyMemberships).not.toHaveBeenCalled();
  });

  it("tournoi rattaché : la liaison locale du créateur n'est jamais utilisée pour encaisser", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(organizationTournament() as never);
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-du-createur" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus({ canReceivePayments: false, status: "RESTRICTED" }) as never);

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toBeDefined();
    expect(getStripeConnectStatus).toHaveBeenCalledWith("club-orga");
    expect(getStripeConnectStatus).not.toHaveBeenCalledWith("club-du-createur");
  });

  it("tournoi rattaché à une organisation héritée partagée (dartsopen) : repli sur la liaison du créateur, comme pour les droits", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(
      organizationTournament({ organization_slug: "dartsopen" }) as never
    );
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-a" } as never);
    vi.mocked(getStripeConnectStatus).mockResolvedValue(stripeStatus({ canReceivePayments: false }) as never);

    await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(getStripeConnectStatus).toHaveBeenCalledWith("club-a");
  });

  it("lecture de la liaison locale impossible (tournoi sans organisation) : refus clair, aucune réservation", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(paidTournament() as never);
    vi.mocked(dbGetOrganization).mockRejectedValue(new Error("connexion perdue"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createRegistration("tournament-1", "Team A", "a@example.com", null, ["Alice", "Bob"]);

    expect(result.error).toMatch(/paiements en ligne ne sont pas disponibles/);
    expect(dbReserveRegistrationSlot).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
