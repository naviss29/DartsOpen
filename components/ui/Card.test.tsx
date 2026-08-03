import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "./Card";

describe("Card", () => {
  it("applique le fond clair par défaut", () => {
    render(<Card data-testid="card">contenu</Card>);
    expect(screen.getByTestId("card").className).toMatch(/bg-white/);
  });

  it("applique le fond sombre DartsOpen quand tone='dark'", () => {
    render(
      <Card tone="dark" data-testid="card">
        contenu
      </Card>,
    );
    const el = screen.getByTestId("card");
    expect(el.className).toMatch(/bg-darts-surface/);
    expect(el.className).not.toMatch(/bg-white/);
  });

  it("rend l'élément HTML demandé via la prop as", () => {
    render(<Card as="section">contenu</Card>);
    expect(screen.getByText("contenu").tagName).toBe("SECTION");
  });
});
