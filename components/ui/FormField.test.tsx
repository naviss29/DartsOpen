import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FormField from "./FormField";

describe("FormField", () => {
  it("associe le label au champ via htmlFor/id", () => {
    render(
      <FormField label="Nom du tournoi" htmlFor="name">
        <input id="name" />
      </FormField>,
    );
    expect(screen.getByLabelText("Nom du tournoi")).toBeInTheDocument();
  });

  it("affiche l'erreur avec role=alert plutôt que l'indice", () => {
    render(
      <FormField label="Nom" htmlFor="name" hint="Indice" error="Champ requis">
        <input id="name" />
      </FormField>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Champ requis");
    expect(screen.queryByText("Indice")).not.toBeInTheDocument();
  });
});
