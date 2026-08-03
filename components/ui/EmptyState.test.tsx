import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("affiche le titre, la description et l'action fournie", () => {
    render(<EmptyState icon="🎯" title="Aucun tournoi" description="Créez votre premier tournoi." action={<button>Créer</button>} />);

    expect(screen.getByText("Aucun tournoi")).toBeInTheDocument();
    expect(screen.getByText("Créez votre premier tournoi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer" })).toBeInTheDocument();
  });
});
