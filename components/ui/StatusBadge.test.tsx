import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "./StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["PENDING_ENTITLEMENT", "En attente de confirmation"],
    ["DRAFT", "Brouillon"],
    ["OPEN", "Inscriptions ouvertes"],
    ["IN_PROGRESS", "En cours"],
    ["FINISHED", "Terminé"],
  ])("affiche le libellé français pour %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("retombe sur le code brut pour un statut inconnu, sans planter", () => {
    render(<StatusBadge status="ARCHIVED" />);
    expect(screen.getByText("ARCHIVED")).toBeInTheDocument();
  });
});
