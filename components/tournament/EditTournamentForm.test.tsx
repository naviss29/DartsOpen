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
} as const;

function tournament(overrides: Partial<Parameters<typeof EditTournamentForm>[0]["tournament"]> = {}) {
  return {
    id: "tournament-1",
    name: "Open de fléchettes",
    date: "2026-06-15",
    location: "Salle des fêtes",
    max_players: 8,
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

describe("EditTournamentForm — droits d'inscription et mode de paiement (DARTSOPEN-MONETIZATION-001/002)", () => {
  it("le champ des droits d'inscription reste éditable même quand Stripe n'est pas opérationnel (mission §7)", async () => {
    render(<EditTournamentForm tournament={tournament()} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();
    fireEvent.change(entryFeeInput, { target: { value: "5" } });
    expect(entryFeeInput.value).toBe("5");
  });

  it("un tournoi déjà payant sans Stripe garde ses droits d'inscription existants (jamais remis à 0, mission §7)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput.value).toBe("15");
  });

  it("sans Stripe opérationnel et des droits positifs : information sobre de règlement sur place, aucun choix de mode de paiement, aucun bandeau anxiogène (DO-STABILIZATION-001, Problème 2)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    expect(screen.getByText(/paiement des inscriptions : sur place/i)).toBeInTheDocument();
    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurer stripe connect/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("avec Stripe opérationnel et des droits positifs : propose un choix explicite de mode de paiement (mission §6, CASE A)", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} stripeConnectStatus="OPERATIONAL" {...defaultProps} />);
    await openForm();

    expect(screen.getByText(/mode de paiement/i)).toBeInTheDocument();
    const radios = screen.getAllByRole("radio").filter((el) => (el as HTMLInputElement).name === "payment_mode");
    expect(radios).toHaveLength(2);
  });

  it("DO-STABILIZATION-001 (Problème 2) : un statut indéterminé est traité comme NOT_OPERATIONAL — même information sobre, jamais 'momentanément indisponible'", async () => {
    render(<EditTournamentForm tournament={tournament({ entry_fee: 1500 })} stripeConnectStatus="INDETERMINATE" {...defaultProps} />);
    await openForm();

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/momentanément indisponible/i)).not.toBeInTheDocument();
    expect(screen.getByText(/paiement des inscriptions : sur place/i)).toBeInTheDocument();
  });
});

describe("EditTournamentForm — règle des 10 joueurs (DO-STABILIZATION-001, Problème 1)", () => {
  it("un tournoi déjà >10 sans entitlement affiche un état explicite nécessitant correction, jamais silencieux (mission Problème 1, UI)", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    expect(screen.getByText(/autorise 32 joueurs/i)).toBeInTheDocument();
    const maxPlayersInput = screen.getByLabelText(/joueurs max/i) as HTMLInputElement;
    expect(maxPlayersInput.value).toBe("32"); // jamais réécrit silencieusement
    expect(maxPlayersInput.max).toBe("10"); // la validation HTML5 native bloque la soumission tant que non corrigé
  });

  it("corriger la valeur (la ramener à 10 ou moins) fait disparaître l'état de correction, remplacé par le rappel du palier gratuit", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "8" } });

    expect(maxPlayersInput.value).toBe("8");
    expect(screen.queryByText(/autorise/i)).not.toBeInTheDocument();
    expect(screen.getByText(/accès payant dartsopen/i)).toBeInTheDocument();
  });

  it("impossible de saisir au-delà de 10 sans entitlement : la valeur est clampée en temps réel", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 8 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} />);
    await openForm();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(maxPlayersInput.value).toBe("10"); // clampé, jamais 32
  });

  it("un tournoi déjà >10 avec un abonnement actif n'affiche aucun état de correction, aucun clamp", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} hasActiveSubscription={true} />);
    await openForm();

    expect(screen.queryByText(/autorise 32 joueurs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();

    const maxPlayersInput = screen.getByLabelText(/joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "64" } });
    expect(maxPlayersInput.value).toBe("64");
  });

  it("un tournoi déjà >10 avec un crédit disponible n'affiche aucun état de correction, aucun clamp", async () => {
    render(<EditTournamentForm tournament={tournament({ max_players: 32 })} stripeConnectStatus="NOT_OPERATIONAL" {...defaultProps} availableCredits={1} />);
    await openForm();

    expect(screen.queryByText(/autorise 32 joueurs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });
});
