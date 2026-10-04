// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/api/organizations", () => ({ getMyOrganizations: vi.fn(), getPaymentAuthorization: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({ dbGetOrganization: vi.fn() }));
vi.mock("@/lib/auth/organizationAccess", () => ({ getCurrentOrganization: vi.fn() }));
vi.mock("@/lib/actions/organization", () => ({ unlinkOrganization: vi.fn(), linkOrganization: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import SettingsPage from "./page";
import { getUser } from "@/lib/api/auth";
import { dbGetOrganization } from "@/lib/db/tournament";
import { getCurrentOrganization } from "@/lib/auth/organizationAccess";
import { catalogs } from "@/lib/i18n/catalogs";

/**
 * Les sections Stripe sont des composants serveur asynchrones : on inspecte l'arbre rendu par la
 * page (éléments et props) plutôt que le DOM, que React ne peut pas produire côté test pour un
 * composant async imbriqué.
 */
function collect(node: ReactNode, predicate: (el: ReactElement) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, predicate, out));
  } else if (isValidElement(node)) {
    if (predicate(node)) out.push(node);
    collect((node.props as { children?: ReactNode }).children, predicate, out);
  }
  return out;
}

const byComponent = (name: string) => (el: ReactElement) => typeof el.type === "function" && el.type.name === name;
const textOf = (node: ReactNode): string[] =>
  collect(node, () => true).flatMap((el) => {
    const children = (el.props as { children?: ReactNode }).children;
    return typeof children === "string" ? [children] : [];
  });

const club = { id: "org-club", slug: "club-a", name: "Club des Flèches", role: "ADMIN" as const };

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue({ id: "u1", email: "alan@example.com", roles: [], isVerified: true });
  vi.mocked(dbGetOrganization).mockReset();
  vi.mocked(getCurrentOrganization).mockReset();
});

describe("Paramètres — ADR-0021 / L7 : organisation courante d'abord, liaison locale en repli", () => {
  it("organisation courante : son état Stripe Connect est affiché, sans bouton « Délier »", async () => {
    vi.mocked(getCurrentOrganization).mockResolvedValue({ status: "OK", current: club, choices: [club], needsSelection: false });
    vi.mocked(dbGetOrganization).mockResolvedValue(null);

    const tree = await SettingsPage();
    const sections = collect(tree, byComponent("StripeConnectSection"));

    expect(sections).toHaveLength(1);
    expect(sections[0].props).toEqual({ slug: "club-a", unlinkable: false });
    expect(textOf(tree)).toContain(catalogs.fr["settings.payments.legacyTitle"]);
    // La liaison locale reste proposée (formulaire) pour les tournois sans organisation.
    expect(collect(tree, byComponent("OrganizationSection"))).toHaveLength(1);
  });

  it("organisation courante + liaison locale : deux sections, seule la liaison locale est déliable", async () => {
    vi.mocked(getCurrentOrganization).mockResolvedValue({ status: "OK", current: club, choices: [club], needsSelection: false });
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "u1", sterOrganizationSlug: "ancien-club" } as never);

    const tree = await SettingsPage();
    const sections = collect(tree, byComponent("StripeConnectSection")).map((el) => el.props);

    expect(sections).toEqual([
      { slug: "club-a", unlinkable: false },
      { slug: "ancien-club", unlinkable: true },
    ]);
  });

  it("compte sans vraie organisation : affichage historique (liaison locale seule, sans titre de repli)", async () => {
    vi.mocked(getCurrentOrganization).mockResolvedValue({ status: "OK", current: null, choices: [], needsSelection: false });
    vi.mocked(dbGetOrganization).mockResolvedValue({ userId: "u1", sterOrganizationSlug: "club-lie" } as never);

    const tree = await SettingsPage();

    expect(collect(tree, byComponent("StripeConnectSection")).map((el) => el.props)).toEqual([
      { slug: "club-lie", unlinkable: true },
    ]);
    expect(textOf(tree)).not.toContain(catalogs.fr["settings.payments.legacyTitle"]);
  });

  it("plusieurs organisations sans choix : invitation à choisir (texte du catalogue)", async () => {
    vi.mocked(getCurrentOrganization).mockResolvedValue({ status: "OK", current: null, choices: [club, { ...club, id: "o2" }], needsSelection: true });
    vi.mocked(dbGetOrganization).mockResolvedValue(null);

    const tree = await SettingsPage();

    expect(textOf(tree)).toContain(catalogs.fr["orgAccess.chooseOrganizationNotice"]);
    expect(collect(tree, byComponent("StripeConnectSection"))).toHaveLength(0);
  });
});
