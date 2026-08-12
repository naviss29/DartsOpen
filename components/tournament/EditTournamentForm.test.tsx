import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EditTournamentForm } from "./EditTournamentForm";

vi.mock("@/lib/actions/tournament", () => ({
  updateTournament: vi.fn(async () => undefined),
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

function tournament(overrides: Partial<Parameters<typeof EditTournamentForm>[0]["tournament"]> = {}) {
  return {
    id: "tournament-1",
    name: "Open de fléchettes",
    date: "2026-06-15",
    location: "Salle des fêtes",
    max_players: 16,
    entry_fee: 0,
    nb_pools: 1,
    nb_boards: 2,
    advancement_per_pool: 1,
    players_per_team: 2,
    registration_mode: "ONLINE",
    payment_mode: "ONSITE",
    scoring_mode: "ELECTRONIC",
    quick_mode: false,
    ...overrides,
  };
}

async function openForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /modifier le tournoi/i }));
}

describe("EditTournamentForm — droits d'inscription et mode de paiement (DARTSOPEN-MONETIZATION-001)", () => {
  it("le champ des droits d'inscription reste éditable même quand Stripe n'est pas opérationnel (mission §7)", async () => {
    render(<EditTournamentForm tournament={tournament()} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();
    fireEvent.change(entryFeeInput, { target: { value: "5" } });
    expect(entryFeeInput.value).toBe("5");
  });

  it("un tournoi déjà payant sans Stripe garde ses droits d'inscription existants (jamais remis à 0, mission §7)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput.value).toBe("15");
  });

  it("sans Stripe opérationnel et des droits positifs : message discret de règlement sur place, aucun choix de mode de paiement (mission §6, CASE B)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    expect(screen.getByText(/réglés sur place/i)).toBeInTheDocument();
    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurez stripe connect dans bapps studio/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("avec Stripe opérationnel et des droits positifs : propose un choix explicite de mode de paiement (mission §6, CASE A)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} canReceivePayments={true} {...defaultProps} />);
    await openForm();

    expect(screen.getByText(/mode de paiement/i)).toBeInTheDocument();
    const radios = screen.getAllByRole("radio").filter((el) => (el as HTMLInputElement).name === "payment_mode");
    expect(radios).toHaveLength(2);
  });
});

describe("EditTournamentForm — règle des 10 joueurs (DARTSOPEN-MONETIZATION-001, mission §12/§15)", () => {
  it("n'alerte jamais pour un tournoi déjà >10 dont la valeur reste inchangée (ne casse jamais un tournoi existant)", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });

  it("n'alerte pas si la valeur diminue tout en restant au-dessus de 10", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "20" } });

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });

  it("alerte quand la valeur augmente réellement au-delà de ce que le tournoi avait déjà, sans droit actif", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 16 })} canReceivePayments={false} {...defaultProps} />);
    await openForm();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(screen.getByText(/accès payant dartsopen/i)).toBeInTheDocument();
  });

  it("n'alerte jamais quand un abonnement actif existe déjà", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 16 })} canReceivePayments={false} {...defaultProps} hasActiveSubscription={true} />);
    await openForm();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i);
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });
});
