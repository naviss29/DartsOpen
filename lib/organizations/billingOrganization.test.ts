import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/auth/organizationAccess", () => ({ getMyMemberships: vi.fn() }));

const { dbGetOrganization } = await import("@/lib/db/tournament");
const { getMyMemberships } = await import("@/lib/auth/organizationAccess");
const { billingSourceForTournament, billingSourceForCreation, resolveBillingOrganizationSlug } = await import("./billingOrganization");

beforeEach(() => {
  vi.mocked(dbGetOrganization).mockReset();
  vi.mocked(getMyMemberships).mockReset();
});

/**
 * ADR-0021 / L7 — règle unique : l'organisation du tournoi (ou l'organisation courante à la
 * création) porte paiement en ligne et crédits ; la liaison locale du créateur n'est qu'un repli
 * pour les tournois sans organisation (même règle que les droits, L6).
 */
describe("billingSourceForTournament", () => {
  it("tournoi rattaché à une vraie organisation ⇒ cette organisation", () => {
    expect(
      billingSourceForTournament({ association_id: "creator-1", organization_id: "org-1", organization_slug: "club" }),
    ).toEqual({ kind: "ORGANIZATION", organizationId: "org-1", organizationSlug: "club" });
  });

  it("tournoi sans organisation (données d'avant L6) ⇒ repli créateur", () => {
    expect(
      billingSourceForTournament({ association_id: "creator-1", organization_id: null, organization_slug: null }),
    ).toEqual({ kind: "CREATOR_FALLBACK", creatorUserId: "creator-1" });
  });

  it("organisation héritée partagée (dartsopen, billetasso) ⇒ jamais une organisation de facturation, repli créateur", () => {
    for (const slug of ["dartsopen", "billetasso"]) {
      expect(
        billingSourceForTournament({ association_id: "creator-1", organization_id: "org-legacy", organization_slug: slug }),
      ).toEqual({ kind: "CREATOR_FALLBACK", creatorUserId: "creator-1" });
    }
  });
});

describe("billingSourceForCreation", () => {
  it("organisation courante retenue ⇒ cette organisation", () => {
    expect(billingSourceForCreation("user-1", { id: "org-1", slug: "club" })).toEqual({
      kind: "ORGANIZATION",
      organizationId: "org-1",
      organizationSlug: "club",
    });
  });

  it("création sans organisation (D3) ⇒ liaison locale de l'utilisateur qui crée", () => {
    expect(billingSourceForCreation("user-1", null)).toEqual({ kind: "CREATOR_FALLBACK", creatorUserId: "user-1" });
  });
});

describe("resolveBillingOrganizationSlug", () => {
  const ORG = { kind: "ORGANIZATION", organizationId: "org-1", organizationSlug: "club-enregistre" } as const;

  it("authentifié : slug actuel relu par UUID dans les appartenances", async () => {
    vi.mocked(getMyMemberships).mockResolvedValue({
      status: "OK",
      stale: false,
      memberships: [{ id: "org-1", slug: "club-actuel", name: "Club", role: "ADMIN" }],
    });

    expect(await resolveBillingOrganizationSlug(ORG, { authenticated: true })).toBe("club-actuel");
  });

  it("authentifié, organisation absente des appartenances ou service indisponible : slug enregistré", async () => {
    vi.mocked(getMyMemberships).mockResolvedValue({ status: "OK", stale: false, memberships: [] });
    expect(await resolveBillingOrganizationSlug(ORG, { authenticated: true })).toBe("club-enregistre");

    vi.mocked(getMyMemberships).mockResolvedValue({ status: "UNAVAILABLE" });
    expect(await resolveBillingOrganizationSlug(ORG, { authenticated: true })).toBe("club-enregistre");
  });

  it("authentifié, lecture des appartenances en exception : slug enregistré, avertissement journalisé", async () => {
    vi.mocked(getMyMemberships).mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await resolveBillingOrganizationSlug(ORG, { authenticated: true })).toBe("club-enregistre");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("parcours public : slug enregistré, sans jamais lire les appartenances (aucun JWT)", async () => {
    expect(await resolveBillingOrganizationSlug(ORG, { authenticated: false })).toBe("club-enregistre");
    expect(getMyMemberships).not.toHaveBeenCalled();
  });

  it("repli créateur : liaison locale (ou null si aucune), sans lire les appartenances", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "creator-1", sterOrganizationSlug: "club-lie" } as never);
    expect(await resolveBillingOrganizationSlug({ kind: "CREATOR_FALLBACK", creatorUserId: "creator-1" }, { authenticated: true })).toBe("club-lie");

    vi.mocked(dbGetOrganization).mockResolvedValue(null);
    expect(await resolveBillingOrganizationSlug({ kind: "CREATOR_FALLBACK", creatorUserId: "creator-1" }, { authenticated: true })).toBeNull();
    expect(getMyMemberships).not.toHaveBeenCalled();
  });

  it("repli créateur, base en erreur : exception au message clair (jamais « aucune organisation »)", async () => {
    vi.mocked(dbGetOrganization).mockRejectedValue(new Error("connexion perdue"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      resolveBillingOrganizationSlug({ kind: "CREATOR_FALLBACK", creatorUserId: "creator-1" }, { authenticated: false }),
    ).rejects.toThrow("Lecture de l'organisation liée du créateur impossible (base DartsOpen).");
    error.mockRestore();
  });
});
