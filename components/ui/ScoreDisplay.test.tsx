import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreDisplay from "./ScoreDisplay";

describe("ScoreDisplay", () => {
  it("affiche la valeur et le libellé optionnel", () => {
    render(<ScoreDisplay value={501} label="Reste à faire" />);
    expect(screen.getByText("501")).toBeInTheDocument();
    expect(screen.getByText("Reste à faire")).toBeInTheDocument();
  });

  it("applique la police à chasse fixe pour l'alignement des chiffres", () => {
    render(<ScoreDisplay value={180} />);
    expect(screen.getByText("180").className).toMatch(/font-score/);
  });
});
