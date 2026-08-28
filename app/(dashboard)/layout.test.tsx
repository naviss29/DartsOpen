// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/tournaments" }));

import DashboardLayout from "./layout";
import { getUser } from "@/lib/api/auth";

const mockedGetUser = vi.mocked(getUser);

beforeEach(() => {
  mockedGetUser.mockReset();
  mockedGetUser.mockResolvedValue({ id: "u1", email: "alan@example.com", roles: [], isVerified: true });
});

/**
 * BAPPS-UX-UNIFICATION-006-FIX-001 — vérifie les deux défauts d'audit propres à ce layout
 * (le troisième, la hauteur de l'en-tête de sidebar, est couvert par DashboardSidebar.test.tsx) :
 * header réellement sticky (l'ancien `overflow-hidden`/`overflow-auto` créait un second
 * conteneur de défilement qui l'aurait annulé), et padding vertical du contenu conforme au
 * seuil `lg:` (1024px), pas `sm:` (640px).
 */
describe("BAPPS-UX-UNIFICATION-006-FIX-001 — header sticky, jamais un simple className sans effet", () => {
  it("AppHeader porte sticky top-0, aucun ancêtre ne porte overflow-hidden/overflow-auto", async () => {
    const element = await DashboardLayout({ children: <div>contenu</div> });
    const { container } = render(element);

    const header = container.querySelector("header") as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(header.className).toMatch(/(^|\s)top-0(\s|$)/);

    // Avant cette correction, le conteneur enveloppant portait overflow-hidden et <main>
    // overflow-auto : un second conteneur de défilement concurrent au document, qui aurait
    // silencieusement annulé tout `sticky` posé sur le header/la sidebar.
    let node: HTMLElement | null = header.parentElement;
    while (node && node !== container) {
      expect(node.className).not.toMatch(/overflow-(hidden|auto)/);
      node = node.parentElement;
    }
  });
});

describe("BAPPS-UX-UNIFICATION-006-FIX-001 — padding vertical du contenu : 24px sous 1024px, 32px dès 1024px", () => {
  it("le conteneur de contenu porte py-6 (24px) et bascule sur lg:py-8 (32px), jamais sm:", async () => {
    const element = await DashboardLayout({ children: <div data-testid="page-content">contenu</div> });
    const { getByTestId } = render(element);

    const content = getByTestId("page-content").parentElement as HTMLElement;
    expect(content.className).toMatch(/(^|\s)py-6(\s|$)/);
    expect(content.className).toMatch(/(^|\s)lg:py-8(\s|$)/);
    // Le breakpoint `sm:` (640px) appliquerait 32px verticaux 384px trop tôt (défaut constaté
    // par l'audit) — seul `lg:` (1024px, contrat de la charte) doit porter py-8.
    expect(content.className).not.toMatch(/(^|\s)sm:py-8(\s|$)/);

    // Le conteneur scrollable (main) ne doit plus porter overflow-auto — voir le test
    // "header sticky" ci-dessus pour la justification complète.
    const main = content.closest("main") as HTMLElement;
    expect(main.className).not.toMatch(/overflow-(hidden|auto)/);
  });
});
