import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TournamentForm } from "./TournamentForm";

vi.mock("@/lib/actions/tournament", () => ({
  createTournament: vi.fn(async () => undefined),
}));

const STRIPE_URL = "https://bapps-studio.com/dashboard/organisations/club-a/stripe";

describe("TournamentForm — option paiement en ligne (DO-PAYMENT-GUARD-001)", () => {
  it("9. désactive le champ des droits d'inscription quand Stripe n'est pas opérationnel", () => {
    render(<TournamentForm canReceivePayments={false} stripeConnectUrl={STRIPE_URL} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription/i) as HTMLInputElement;
    expect(entryFeeInput).toBeDisabled();
    expect(entryFeeInput.value).toBe("0");
  });

  it("10. affiche une explication claire (pas une erreur technique) et un lien vers Stripe Connect BApps Studio", () => {
    render(<TournamentForm canReceivePayments={false} stripeConnectUrl={STRIPE_URL} />);

    expect(screen.getByText(/nécessite un compte stripe connect opérationnel/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurez stripe connect dans bapps studio/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("11. le champ des droits d'inscription reste éditable quand Stripe est opérationnel (Stripe n'oblige jamais le paiement)", () => {
    render(<TournamentForm canReceivePayments={true} stripeConnectUrl={STRIPE_URL} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();
    expect(screen.queryByText(/nécessite un compte stripe connect opérationnel/i)).not.toBeInTheDocument();
  });

  it("le mode d'inscription en ligne reste sélectionnable même sans Stripe (une inscription en ligne gratuite ne nécessite aucun Stripe)", () => {
    render(<TournamentForm canReceivePayments={false} stripeConnectUrl={STRIPE_URL} />);

    const onlineRadio = screen.getAllByRole("radio").find((el) => (el as HTMLInputElement).value === "ONLINE");
    expect(onlineRadio).not.toBeDisabled();
  });
});
