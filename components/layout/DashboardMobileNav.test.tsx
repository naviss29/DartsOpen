import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardMobileNav from "./DashboardMobileNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
}));

/**
 * DO-BETA-UX-001 — remplace l'ancienne barre horizontale à scroll par un menu hamburger
 * explicite (même grammaire que BSsite, UX-UI-Standards.md §3 "Navigation mobile") : le logo et
 * la navigation ne doivent plus jamais disparaître sans remplacement sur mobile.
 */
describe("DashboardMobileNav", () => {
  it("affiche le logo DartsOpen même en repli mobile", () => {
    render(<DashboardMobileNav />);
    expect(screen.getByRole("img", { name: "DartsOpen" })).toBeInTheDocument();
  });

  it("le menu est fermé par défaut, ouvert par un bouton hamburger explicite (aria-expanded)", () => {
    render(<DashboardMobileNav />);

    const toggle = screen.getByRole("button", { name: /ouvrir le menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /fermer le menu/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toBeInTheDocument();
  });

  it("le menu liste les mêmes destinations que la sidebar desktop, y compris Contact", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    expect(screen.getByRole("link", { name: /Tableau de bord/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toHaveAttribute("href", "/tournaments");
    expect(screen.getByRole("link", { name: /Paramètres/ })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /Contact/ })).toHaveAttribute("href", "/contact");
  });

  it("cliquer un lien referme le menu (n'reste jamais ouvert après navigation)", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    fireEvent.click(screen.getByRole("link", { name: /Mes tournois/ }));

    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toHaveAttribute("aria-expanded", "false");
  });
});
