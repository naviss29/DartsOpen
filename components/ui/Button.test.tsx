import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "./Button";

describe("Button", () => {
  it("applique le vert DartsOpen pour la variante primary par défaut", () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole("button", { name: "Valider" }).className).toMatch(/bg-darts-green/);
  });

  it("applique le rouge DartsOpen pour la variante danger-solid", () => {
    render(<Button variant="danger-solid">Supprimer</Button>);
    expect(screen.getByRole("button", { name: "Supprimer" }).className).toMatch(/bg-darts-red/);
  });

  it("laisse la variante secondary inchangée (pas de surcharge de couleur)", () => {
    render(<Button variant="secondary">Annuler</Button>);
    const el = screen.getByRole("button", { name: "Annuler" });
    expect(el.className).not.toMatch(/bg-darts-/);
  });

  it("rend un lien quand href est fourni, comme le Button du design-system", () => {
    render(<Button href="/tournaments">Voir</Button>);
    expect(screen.getByRole("link", { name: "Voir" })).toHaveAttribute("href", "/tournaments");
  });
});
