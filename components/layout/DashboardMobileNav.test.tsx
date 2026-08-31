import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardMobileNav from "./DashboardMobileNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
}));

/**
 * BAPPS-UX-UNIFICATION-006 LOT 2 — remplace la couverture de l'ancienne bande blanche
 * (dropdown pleine largeur sous une seconde barre 64px) par celle du nouveau contrat : un
 * wordmark + déclencheur persistants (destinés au slot `start` d'AppHeader) qui ouvrent un
 * panneau latéral (drawer, pas une bande empilée) — charte BApps Studio §4.1 ("une seule barre
 * de 64 px + drawer") / §11.3 ("Une seule barre structurelle mobile de 64 px").
 */
describe("DashboardMobileNav", () => {
  it("affiche le wordmark DartsOpen même en repli mobile (identité toujours visible)", () => {
    render(<DashboardMobileNav />);
    const brandLink = screen.getByRole("link", { name: "DartsOpen" });
    expect(brandLink).toHaveAttribute("href", "/dashboard");
    expect(brandLink.querySelector("img")).toHaveAttribute("src", expect.stringContaining("dartsopen-symbol.svg"));
  });

  it("le menu est fermé par défaut, ouvert par un bouton hamburger explicite (aria-expanded)", () => {
    render(<DashboardMobileNav />);

    const toggle = screen.getByRole("button", { name: /ouvrir le menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /fermer le menu/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toBeInTheDocument();
  });

  it("le drawer liste les mêmes destinations que la sidebar desktop", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    expect(screen.getByRole("link", { name: /Tableau de bord/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toHaveAttribute("href", "/tournaments");
    expect(screen.getByRole("link", { name: /Paramètres/ })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: /Contact/ })).not.toBeInTheDocument();
  });

  it("cliquer un lien referme le drawer (ne reste jamais ouvert après navigation)", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    fireEvent.click(screen.getByRole("link", { name: /Mes tournois/ }));

    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("le bouton de fermeture explicite referme le drawer", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));

    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("la touche Échap referme le drawer", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("un clic sur le fond (backdrop) referme le drawer, un clic dans le panneau ne le referme pas", () => {
    render(<DashboardMobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu/i }));

    fireEvent.mouseDown(screen.getByRole("navigation"));
    expect(screen.getByRole("link", { name: /Mes tournois/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("dashboard-mobile-nav-backdrop"));
    expect(screen.queryByRole("link", { name: /Mes tournois/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ouvrir le menu/i })).toHaveAttribute("aria-expanded", "false");
  });
});
