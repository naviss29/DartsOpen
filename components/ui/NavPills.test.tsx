import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NavPills from "./NavPills";

describe("NavPills", () => {
  const items = [
    { href: "/a", label: "Joueurs" },
    { href: "/b", label: "Poules", current: true },
  ];

  it("marque l'onglet courant avec aria-current", () => {
    render(<NavPills items={items} />);
    expect(screen.getByRole("link", { name: "Poules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Joueurs" })).not.toHaveAttribute("aria-current");
  });

  it("pointe chaque lien vers le href fourni", () => {
    render(<NavPills items={items} />);
    expect(screen.getByRole("link", { name: "Joueurs" })).toHaveAttribute("href", "/a");
  });

  it("affiche le compteur optionnel quand il est fourni", () => {
    render(<NavPills items={[{ href: "/a", label: "Joueurs", badge: "4/8" }]} />);
    expect(screen.getByText("4/8")).toBeInTheDocument();
  });

  it("rend un onglet désactivé comme un span non cliquable", () => {
    render(<NavPills items={[{ href: "/c", label: "Phases finales", disabled: true, disabledReason: "Démarrez le tournoi" }]} />);
    expect(screen.queryByRole("link", { name: "Phases finales" })).not.toBeInTheDocument();
    const el = screen.getByText("Phases finales");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("title", "Démarrez le tournoi");
  });
});
