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

  it("utilise le logo officiel DartsOpen, jamais un emoji comme identité produit", () => {
    render(<DashboardSidebar />);
    const logo = screen.getByRole("img", { name: "DartsOpen" });
    expect(logo).toHaveAttribute("src", "/brand/logo-horizontal.svg");
  });

  it("DO-BETA-UX-001 — porte la signature de l'écosystème sous forme de lien cliquable vers BSsite (UX-UI-Standards §3bis)", () => {
    render(<DashboardSidebar />);
    const link = screen.getByRole("link", { name: /by BApps Studio/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("DO-BETA-UX-001 — expose Contact comme entrée de navigation normale (mission §2)", () => {
    render(<DashboardSidebar />);
    expect(screen.getByRole("link", { name: /Contact/ })).toHaveAttribute("href", "/contact");
  });

  it("DO-PAYPAL-REMOVAL-001 — n'affiche plus aucun lien vers /dons (legacy PayPal supprimé)", () => {
    render(<DashboardSidebar />);
    expect(screen.queryByRole("link", { name: /soutenir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "/dons" })).not.toBeInTheDocument();
  });
});
