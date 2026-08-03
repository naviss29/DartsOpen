import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "./Button";

describe("Button", () => {
  it("applique l'accent BApps Studio (turquoise) pour la variante primary par défaut, sans surcharge locale", () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole("button", { name: "Valider" }).className).toMatch(/bg-accent/);
  });

  it("laisse la variante secondary inchangée (pas de surcharge de couleur)", () => {
    render(<Button variant="secondary">Annuler</Button>);
    const el = screen.getByRole("button", { name: "Annuler" });
    expect(el.className).not.toMatch(/bg-accent/);
  });

  it("rend un lien Next.js (navigation cliente) quand href est fourni", () => {
    render(<Button href="/tournaments">Voir</Button>);
    expect(screen.getByRole("link", { name: "Voir" })).toHaveAttribute("href", "/tournaments");
  });
});
