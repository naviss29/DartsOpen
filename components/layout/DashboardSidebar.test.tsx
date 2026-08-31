import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardSidebar from "./DashboardSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
}));

describe("DashboardSidebar", () => {
  it("marque comme actif le lien correspondant à la page courante", () => {
    render(<DashboardSidebar />);

    expect(screen.getByRole("link", { name: /Mes tournois/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Tableau de bord/ })).not.toHaveAttribute("aria-current");
  });

  it("BAPPS-SHELL-001 — affiche le symbole DartsOpen devant le nom du produit", () => {
    const { container } = render(<DashboardSidebar />);
    const brandLink = screen.getByRole("link", { name: "DartsOpen" });
    expect(brandLink).toHaveAttribute("href", "/dashboard");
    expect(brandLink.querySelector("img")).toHaveAttribute("src", expect.stringContaining("dartsopen-symbol.svg"));
    expect(container.querySelector("aside")).toContainElement(brandLink);
  });

  it("DO-BETA-UX-001 — porte la signature de l'écosystème sous forme de lien cliquable vers BSsite (UX-UI-Standards §3bis)", () => {
    render(<DashboardSidebar />);
    const link = screen.getByRole("link", { name: /by BApps Studio/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href");
    expect(link).toHaveAttribute("target", "_blank");
  });


  it("BAPPS-SHELL-002 — la sidebar utilise le même token que le header (AppHeader, DS) : --color-sidenav-surface, jamais une couleur hardcodée localement", () => {
    render(<DashboardSidebar />);
    const sidebar = screen.getByRole("link", { name: /Tableau de bord/ }).closest("aside");
    expect(sidebar).toHaveStyle({ backgroundColor: "var(--color-sidenav-surface)" });
  });

  it("DO-PAYPAL-REMOVAL-001 — n'affiche plus aucun lien vers /dons (legacy PayPal supprimé)", () => {
    render(<DashboardSidebar />);
    expect(screen.queryByRole("link", { name: /soutenir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "/dons" })).not.toBeInTheDocument();
  });

  it("n’affiche plus l’écran Contact obsolète dans la navigation produit", () => {
    render(<DashboardSidebar />);
    expect(screen.queryByRole("link", { name: /Contact/ })).not.toBeInTheDocument();
  });
});

describe("BAPPS-UX-UNIFICATION-006-FIX-001 — en-tête de sidebar 64px, alignée avec AppHeader", () => {
  it("l'en-tête de sidebar porte h-16 (64px, --layout-header-height d'AppHeader) et aucun padding vertical additionnel", () => {
    const { container } = render(<DashboardSidebar />);
    const aside = container.querySelector("aside") as HTMLElement;
    const header = aside.firstElementChild as HTMLElement;

    expect(header.className).toMatch(/(^|\s)h-16(\s|$)/);
    // p-6/py-* ajouterait une hauteur réelle au-delà des 64px fixés par h-16 (régression du
    // défaut ≈76px constaté par l'audit Codex) — seul un padding horizontal est autorisé ici.
    expect(header.className).not.toMatch(/(^|\s)p-6(\s|$)/);
    expect(header.className).not.toMatch(/(^|\s)py-\d/);
  });
});

describe("BAPPS-UX-UNIFICATION-006-FIX-002 — sidebar réellement sticky sur la hauteur dynamique du viewport", () => {
  it("porte sticky top-0 h-dvh et garde la signature collée en bas", () => {
    const { container } = render(<DashboardSidebar />);
    const aside = container.querySelector("aside") as HTMLElement;

    expect(aside.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(aside.className).toMatch(/(^|\s)top-0(\s|$)/);
    expect(aside.className).toMatch(/(^|\s)h-dvh(\s|$)/);
    const signature = screen.getByRole("link", { name: /by BApps Studio/i }).parentElement as HTMLElement;
    expect(signature.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(signature.className).toMatch(/(^|\s)bottom-0(\s|$)/);
  });
});
