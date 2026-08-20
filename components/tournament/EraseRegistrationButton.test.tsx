import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EraseRegistrationButton } from "./EraseRegistrationButton";

const eraseRegistration = vi.fn(async (_registrationId: string, _tournamentId: string) => ({}));
vi.mock("@/lib/actions/player", () => ({
  eraseRegistration: (registrationId: string, tournamentId: string) => eraseRegistration(registrationId, tournamentId),
}));

/**
 * DO-BETA-UX-001 — remplace window.confirm() par ConfirmDialog (DS) : l'action ne doit jamais
 * partir sans confirmation explicite, et le dialogue doit être un vrai composant accessible
 * (pas une boîte navigateur), jamais déclenché sans clic sur "Effacer".
 */
describe("EraseRegistrationButton", () => {
  it("n'appelle jamais eraseRegistration sans confirmation", () => {
    render(<EraseRegistrationButton registrationId="r1" tournamentId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /effacer les données/i }));

    expect(eraseRegistration).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("annuler ferme le dialogue sans appeler l'action", () => {
    render(<EraseRegistrationButton registrationId="r1" tournamentId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /effacer les données/i }));
    fireEvent.click(screen.getByRole("button", { name: /annuler/i }));

    expect(eraseRegistration).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirmer appelle l'action avec les bons identifiants", async () => {
    render(<EraseRegistrationButton registrationId="r1" tournamentId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /effacer les données/i }));
    fireEvent.click(screen.getByRole("button", { name: /^effacer$/i }));

    await waitFor(() => expect(eraseRegistration).toHaveBeenCalledWith("r1", "t1"));
  });
});
