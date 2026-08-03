import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardSidebar from "./DashboardSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
}));

describe("DashboardSidebar", () => {
  it("marque comme actif le lien correspondant à la page courante", () => {
    render(<DashboardSidebar userEmail="organisateur@example.com" />);

    expect(screen.getByRole("link", { name: /Mes tournois/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Tableau de bord/ })).not.toHaveAttribute("aria-current");
  });

  it("affiche l'email de l'utilisateur connecté", () => {
    render(<DashboardSidebar userEmail="organisateur@example.com" />);
    expect(screen.getByText("organisateur@example.com")).toBeInTheDocument();
  });

  it("utilise le logo officiel DartsOpen, jamais un emoji comme identité produit", () => {
    render(<DashboardSidebar userEmail="organisateur@example.com" />);
    const logo = screen.getByRole("img", { name: "DartsOpen" });
    expect(logo).toHaveAttribute("src", "/brand/logo-horizontal.svg");
  });

  it("porte la signature discrète de l'écosystème", () => {
    render(<DashboardSidebar userEmail="organisateur@example.com" />);
    expect(screen.getByText("by BApps Studio")).toBeInTheDocument();
  });
});
