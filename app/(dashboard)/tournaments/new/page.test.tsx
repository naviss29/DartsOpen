// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/payments/onlinePaymentGuard", () => ({ getOnlinePaymentUiState: vi.fn() }));
vi.mock("@/lib/entitlements/tournamentSizeGuard", () => ({ getTournamentSizeUiState: vi.fn() }));
vi.mock("@/lib/auth/organizationAccess", () => ({ resolveTournamentCreationTarget: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/components/tournament/TournamentForm", () => ({ TournamentForm: function TournamentForm() { return null; } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import NewTournamentPage from "./page";
import { getUser } from "@/lib/api/auth";
import { getOnlinePaymentUiState } from "@/lib/payments/onlinePaymentGuard";
import { getTournamentSizeUiState } from "@/lib/entitlements/tournamentSizeGuard";
import { resolveTournamentCreationTarget } from "@/lib/auth/organizationAccess";

function find(node: ReactNode, name: string): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, name);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (typeof node.type === "function" && node.type.name === name) return node;
  return find((node.props as { children?: ReactNode }).children, name);
}

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue({ id: "u1", email: "alan@example.com", roles: [], isVerified: true });
  vi.mocked(getOnlinePaymentUiState).mockReset().mockResolvedValue({ status: "OPERATIONAL", canReceivePayments: true, organizationSlug: "club-a" });
  vi.mocked(getTournamentSizeUiState).mockReset().mockResolvedValue({ hasActiveSubscription: false, availableCredits: 2, organizationSlug: "club-a" });
  vi.mocked(resolveTournamentCreationTarget).mockReset();
});

describe("Nouveau tournoi — ADR-0021 / L7 : paiement et crédits de l'organisation où le tournoi naîtra", () => {
  it("organisation courante OWNER/ADMIN : états lus sur cette organisation, liens BSsite vers elle (BUG-4)", async () => {
    vi.mocked(resolveTournamentCreationTarget).mockResolvedValue({ ok: true, organization: { id: "org-a", slug: "club-a" } });

    const tree = await NewTournamentPage();

    const source = { kind: "ORGANIZATION", organizationId: "org-a", organizationSlug: "club-a" };
    expect(getOnlinePaymentUiState).toHaveBeenCalledWith(source);
    expect(getTournamentSizeUiState).toHaveBeenCalledWith(source);
    const form = find(tree, "TournamentForm");
    expect(form?.props).toMatchObject({ stripeConnectStatus: "OPERATIONAL", availableCredits: 2 });
    expect((form?.props as { stripeConnectUrl: string }).stripeConnectUrl).toMatch(/\/organisations\/club-a\/stripe$/);
  });

  it("compte sans organisation (D3) : repli sur la liaison locale de l'utilisateur", async () => {
    vi.mocked(resolveTournamentCreationTarget).mockResolvedValue({ ok: true, organization: null });

    await NewTournamentPage();

    expect(getOnlinePaymentUiState).toHaveBeenCalledWith({ kind: "CREATOR_FALLBACK", creatorUserId: "u1" });
  });

  it("création refusée : aucune organisation interrogée et motif traduit affiché d'emblée", async () => {
    vi.mocked(resolveTournamentCreationTarget).mockResolvedValue({ ok: false, error: "Choisissez d’abord l’organisation." });
    vi.mocked(getOnlinePaymentUiState).mockResolvedValue({ status: "NOT_OPERATIONAL", canReceivePayments: false, organizationSlug: null });

    const tree = await NewTournamentPage();

    expect(getOnlinePaymentUiState).toHaveBeenCalledWith(null);
    expect(getTournamentSizeUiState).toHaveBeenCalledWith(null);
    expect(JSON.stringify(tree)).toContain("Choisissez d’abord l’organisation.");
  });
});
