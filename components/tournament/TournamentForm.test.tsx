import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TournamentForm } from "./TournamentForm";

vi.mock("@/lib/actions/tournament", () => ({
  createTournament: vi.fn(async () => undefined),
}));

const STRIPE_URL = "https://bapps-studio.com/dashboard/organisations/club-a/stripe";
const SUBSCRIPTION_URL = "https://bapps-studio.com/dashboard/organisations/club-a/abonnement/dartsopen";
const CREDIT_URL = "https://bapps-studio.com/dashboard/organisations/club-a/credits/dartsopen";

const defaultProps = {
  stripeConnectUrl: STRIPE_URL,
  hasActiveSubscription: false,
  availableCredits: 0,
  subscriptionUrl: SUBSCRIPTION_URL,
  creditPurchaseUrl: CREDIT_URL,
};

describe("TournamentForm — droits d'inscription et mode de paiement (DARTSOPEN-MONETIZATION-001)", () => {
  it("le champ des droits d'inscription reste éditable même quand Stripe n'est pas opérationnel (mission §7 — jamais forcé à 0)", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();

    fireEvent.change(entryFeeInput, { target: { value: "5" } });
    expect(entryFeeInput.value).toBe("5");
  });

  it("sans Stripe opérationnel : un message discret indique un règlement sur place, jamais que le tournoi est bloqué (mission §6)", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "5" } });

    expect(screen.getByText(/réglés sur place/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurez stripe connect dans bapps studio/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("sans Stripe opérationnel : aucun choix de mode de paiement en ligne/sur place n'est affiché (mission §6, CASE B)", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "5" } });

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
  });

  it("avec Stripe opérationnel et des droits positifs : propose un choix explicite de mode de paiement (mission §6, CASE A)", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={true} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "10" } });

    expect(screen.getByText(/mode de paiement/i)).toBeInTheDocument();
    const radios = screen.getAllByRole("radio").filter((el) => (el as HTMLInputElement).name === "payment_mode");
    expect(radios).toHaveLength(2);
  });

  it("aucun choix de mode de paiement n'est affiché pour un tournoi gratuit, même avec Stripe opérationnel", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={true} />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    fireEvent.change(entryFeeInput, { target: { value: "0" } });

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
  });

  it("le mode d'inscription en ligne reste sélectionnable même sans Stripe (indépendant du mode de paiement, mission §5)", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const onlineRadio = screen.getAllByRole("radio").find((el) => (el as HTMLInputElement).value === "ONLINE" && (el as HTMLInputElement).name === "registration_mode");
    expect(onlineRadio).not.toBeDisabled();
  });
});

describe("TournamentForm — règle des 10 joueurs (DARTSOPEN-MONETIZATION-001, mission §3/§10)", () => {
  it("propose 16 joueurs par défaut avec un rappel du palier gratuit à 10", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    expect(maxPlayersInput.value).toBe("16");
    expect(screen.getByText(/jusqu'à 10 joueurs/i)).toBeInTheDocument();
  });

  it("propose 1 poule et 2 cibles par défaut", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    expect((screen.getByLabelText(/nombre de poules/i) as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText(/nombre de cibles disponibles/i) as HTMLInputElement).value).toBe("2");
  });

  it("n'affiche aucune option payante tant que la valeur reste à 10 ou moins", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "10" } });

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });

  it("affiche les options crédit/abonnement dès que la valeur dépasse 10 sans droit actif", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "16" } });

    expect(screen.getByText(/accès payant dartsopen/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crédit tournoi/i })).toHaveAttribute("href", CREDIT_URL);
    expect(screen.getByRole("link", { name: /abonnement dartsopen/i })).toHaveAttribute("href", SUBSCRIPTION_URL);
  });

  it("n'affiche aucune option payante au-delà de 10 quand un abonnement actif existe déjà", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} hasActiveSubscription={true} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });

  it("n'affiche aucune option payante au-delà de 10 quand un crédit est disponible", () => {
    render(<TournamentForm {...defaultProps} canReceivePayments={false} availableCredits={1} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });
});
