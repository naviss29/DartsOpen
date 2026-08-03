import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardSidebar from "./DashboardSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
}));
vi.mock("@/lib/actions/auth", () => ({
  logout: vi.fn(),
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
});
