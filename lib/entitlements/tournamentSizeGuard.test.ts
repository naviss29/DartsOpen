import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/api/organizations", () => ({ hasOptionalSubscriptionAccess: vi.fn() }));
vi.mock("@/lib/api/tournamentCredits", () => ({
  consumeTournamentCredit: vi.fn(),
  reconcileTournamentCredit: vi.fn(),
  getTournamentCreditsAvailable: vi.fn(),
}));
vi.mock("@/lib/auth/organizationAccess", () => ({ getMyMemberships: vi.fn() }));

const { consumeTournamentCredit, reconcileTournamentCredit, getTournamentCreditsAvailable } = await import("@/lib/api/tournamentCredits");
const { dbGetOrganization } = await import("@/lib/db/tournament");
const { hasOptionalSubscriptionAccess } = await import("@/lib/api/organizations");
const { getMyMemberships } = await import("@/lib/auth/organizationAccess");
const { consumeTournamentSizeCredit, resolveTournamentSizeEntitlement, getTournamentSizeUiState } = await import("./tournamentSizeGuard");

beforeEach(() => {
  vi.mocked(consumeTournamentCredit).mockReset();
  vi.mocked(reconcileTournamentCredit).mockReset();
});

/**
 * DARTSOPEN-MONETIZATION-003 (P2, contre-audit) — preuve que consumeTournamentSizeCredit()
 * orchestre correctement les trois issues, et surtout qu'un résultat INDETERMINATE (timeout)
 * déclenche une réconciliation par référence — jamais une seconde hypothèse locale, jamais un
 * refus silencieux d'un crédit réellement consommé.
 */
describe("consumeTournamentSizeCredit — orchestration CONFIRMED/REJECTED/INDETERMINATE", () => {
  it("CONFIRMED direct : ne réconcilie jamais (inutile, l'issue est déjà certaine)", async () => {
    vi.mocked(consumeTournamentCredit).mockResolvedValue({ outcome: "CONFIRMED", creditId: "credit-1" });

    const outcome = await consumeTournamentSizeCredit("club-a", "tournament-1");

    expect(outcome).toBe("CONFIRMED");
    expect(reconcileTournamentCredit).not.toHaveBeenCalled();
    expect(consumeTournamentCredit).toHaveBeenCalledTimes(1);
  });

  it("REJECTED direct (409, refus métier certain) : ne réconcilie jamais", async () => {
    vi.mocked(consumeTournamentCredit).mockResolvedValue({ outcome: "REJECTED" });

    const outcome = await consumeTournamentSizeCredit("club-a", "tournament-1");

    expect(outcome).toBe("REJECTED");
    expect(reconcileTournamentCredit).not.toHaveBeenCalled();
  });

  it("scénario du contre-audit : SterPlatform consomme réellement, la réponse de consume() se perd (timeout), la réconciliation par référence confirme le tournoi — exactement un appel de consommation", async () => {
    vi.mocked(consumeTournamentCredit).mockResolvedValue({ outcome: "INDETERMINATE" });
    vi.mocked(reconcileTournamentCredit).mockResolvedValue("CONSUMED");

    const outcome = await consumeTournamentSizeCredit("club-a", "tournament-1");

    expect(outcome).toBe("CONFIRMED");
    expect(consumeTournamentCredit).toHaveBeenCalledTimes(1);
    expect(reconcileTournamentCredit).toHaveBeenCalledTimes(1);
    expect(reconcileTournamentCredit).toHaveBeenCalledWith("club-a", "tournament-1");
  });

  it("INDETERMINATE puis réconciliation NOT_CONSUMED : traité comme REJECTED (jamais une confirmation sur un fait négatif)", async () => {
    vi.mocked(consumeTournamentCredit).mockResolvedValue({ outcome: "INDETERMINATE" });
    vi.mocked(reconcileTournamentCredit).mockResolvedValue("NOT_CONSUMED");

    const outcome = await consumeTournamentSizeCredit("club-a", "tournament-1");

    expect(outcome).toBe("REJECTED");
  });

  it("INDETERMINATE puis réconciliation elle-même indéterminée : reste INDETERMINATE, jamais un refus ni une confirmation devinés", async () => {
    vi.mocked(consumeTournamentCredit).mockResolvedValue({ outcome: "INDETERMINATE" });
    vi.mocked(reconcileTournamentCredit).mockResolvedValue("INDETERMINATE");

    const outcome = await consumeTournamentSizeCredit("club-a", "tournament-1");

    expect(outcome).toBe("INDETERMINATE");
  });
});

/**
 * ADR-0021 / L7 — abonnement et crédits appartiennent à l'organisation du tournoi (ou à
 * l'organisation courante à la création) ; la liaison locale du créateur n'est plus qu'un repli
 * pour un tournoi sans organisation.
 */
describe("resolveTournamentSizeEntitlement / getTournamentSizeUiState — organisation qui porte les droits", () => {
  const ORGANIZATION = { kind: "ORGANIZATION", organizationId: "org-uuid-1", organizationSlug: "club-orga" } as const;
  const CREATOR_FALLBACK = { kind: "CREATOR_FALLBACK", creatorUserId: "user-1" } as const;

  beforeEach(() => {
    vi.mocked(dbGetOrganization).mockReset();
    vi.mocked(hasOptionalSubscriptionAccess).mockReset();
    vi.mocked(getTournamentCreditsAvailable).mockReset();
    vi.mocked(getMyMemberships).mockReset();
    vi.mocked(getMyMemberships).mockResolvedValue({
      status: "OK",
      stale: false,
      memberships: [{ id: "org-uuid-1", slug: "club-orga", name: "Club", role: "ADMIN" }],
    });
  });

  it("tournoi rattaché : crédit tenté sur l'organisation du tournoi, jamais sur la liaison du créateur", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-du-createur" } as never);
    vi.mocked(hasOptionalSubscriptionAccess).mockResolvedValue(false);

    const resolution = await resolveTournamentSizeEntitlement(ORGANIZATION);

    expect(resolution).toEqual({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-orga" });
    expect(hasOptionalSubscriptionAccess).toHaveBeenCalledWith("club-orga", "DARTSOPEN");
    expect(dbGetOrganization).not.toHaveBeenCalled();
  });

  it("tournoi rattaché avec abonnement actif de l'organisation : SUBSCRIPTION", async () => {
    vi.mocked(hasOptionalSubscriptionAccess).mockResolvedValue(true);

    expect(await resolveTournamentSizeEntitlement(ORGANIZATION)).toEqual({ mode: "SUBSCRIPTION" });
  });

  it("tournoi sans organisation : repli sur la liaison locale du créateur", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "user-1", sterOrganizationSlug: "club-du-createur" } as never);
    vi.mocked(hasOptionalSubscriptionAccess).mockResolvedValue(false);

    const resolution = await resolveTournamentSizeEntitlement(CREATOR_FALLBACK);

    expect(resolution).toEqual({ mode: "CREDIT_ATTEMPT", organizationSlug: "club-du-createur" });
    expect(dbGetOrganization).toHaveBeenCalledWith("user-1");
  });

  it("tournoi sans organisation et créateur sans liaison : NONE (NO_ORGANIZATION)", async () => {
    vi.mocked(dbGetOrganization).mockResolvedValue(null);

    expect(await resolveTournamentSizeEntitlement(CREATOR_FALLBACK)).toEqual({ mode: "NONE", reason: "NO_ORGANIZATION" });
    expect(hasOptionalSubscriptionAccess).not.toHaveBeenCalled();
  });

  it("affichage : abonnement et crédits de l'organisation du tournoi", async () => {
    vi.mocked(hasOptionalSubscriptionAccess).mockResolvedValue(false);
    vi.mocked(getTournamentCreditsAvailable).mockResolvedValue(3);

    const state = await getTournamentSizeUiState(ORGANIZATION);

    expect(state).toEqual({ hasActiveSubscription: false, availableCredits: 3, organizationSlug: "club-orga" });
    expect(getTournamentCreditsAvailable).toHaveBeenCalledWith("club-orga");
  });

  it("affichage sans organisation exploitable (source null) : aucun droit supposé, aucun appel SterPlatform", async () => {
    const state = await getTournamentSizeUiState(null);

    expect(state).toEqual({ hasActiveSubscription: false, availableCredits: 0, organizationSlug: null });
    expect(hasOptionalSubscriptionAccess).not.toHaveBeenCalled();
  });
});
