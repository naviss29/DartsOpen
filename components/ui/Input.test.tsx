import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Input from "./Input";

describe("Input", () => {
  it("reste au thème clair par défaut", () => {
    render(<Input aria-label="Nom" />);
    expect(screen.getByLabelText("Nom").className).not.toMatch(/darts-surface/);
  });

  it("applique le thème sombre quand tone='dark'", () => {
    render(<Input aria-label="Nom" tone="dark" />);
    expect(screen.getByLabelText("Nom").className).toMatch(/border-darts-border/);
  });
});
