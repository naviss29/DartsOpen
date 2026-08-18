import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/api/organizations", () => ({ hasOptionalSubscriptionAccess: vi.fn() }));
vi.mock("@/lib/api/tournamentCredits", () => ({
  consumeTournamentCredit: vi.fn(),
  reconcileTournamentCredit: vi.fn(),
  getTournamentCreditsAvailable: vi.fn(),
}));

const { consumeTournamentCredit, reconcileTournamentCredit } = await import("@/lib/api/tournamentCredits");
const { consumeTournamentSizeCredit } = await import("./tournamentSizeGuard");

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
