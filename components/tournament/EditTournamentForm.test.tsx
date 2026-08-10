import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EditTournamentForm } from "./EditTournamentForm";

vi.mock("@/lib/actions/tournament", () => ({
  updateTournament: vi.fn(async () => undefined),
}));

const STRIPE_URL = "https://bapps-studio.com/dashboard/organisations/club-a/stripe";

function tournament(overrides: Partial<Parameters<typeof EditTournamentForm>[0]["tournament"]> = {}) {
  return {
    id: "tournament-1",
    name: "Open de fléchettes",
    date: "2026-06-15",
    location: "Salle des fêtes",
    max_players: 32,
    entry_fee: 0,
    nb_pools: 8,
    nb_boards: 4,
    advancement_per_pool: 1,
    players_per_team: 2,
    registration_mode: "ONLINE",
    scoring_mode: "ELECTRONIC",
    quick_mode: false,
    ...overrides,
  };
}

async function openForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /modifier le tournoi/i }));
}

describe("EditTournamentForm — option paiement en ligne (DO-PAYMENT-GUARD-001)", () => {
  it("9. désactive le champ des droits d'inscription quand Stripe n'est pas opérationnel", async () => {
    render(<EditTournamentForm tournament={tournament()} canReceivePayments={false} stripeConnectUrl={STRIPE_URL} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription/i) as HTMLInputElement;
    expect(entryFeeInput).toBeDisabled();
  });

  it("10. affiche une explication claire et un lien vers Stripe Connect BApps Studio", async () => {
    render(<EditTournamentForm tournament={tournament()} canReceivePayments={false} stripeConnectUrl={STRIPE_URL} />);
    await openForm();

    expect(screen.getByText(/nécessite un compte stripe connect opérationnel/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurez stripe connect dans bapps studio/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("avertit explicitement quand un tournoi déjà payant sera remis à 0 (pas de surprise silencieuse à l'enregistrement)", async () => {
    render(
      <EditTournamentForm
        tournament={tournament({ entry_fee: 1500 })}
        canReceivePayments={false}
        stripeConnectUrl={STRIPE_URL}
      />
    );
    await openForm();

    expect(screen.getByText(/remis à 0 \(gratuit\)/i)).toBeInTheDocument();
  });

  it("n'affiche pas l'avertissement de remise à 0 pour un tournoi déjà gratuit", async () => {
    render(
      <EditTournamentForm
        tournament={tournament({ entry_fee: 0 })}
        canReceivePayments={false}
        stripeConnectUrl={STRIPE_URL}
      />
    );
    await openForm();

    expect(screen.queryByText(/remis à 0 \(gratuit\)/i)).not.toBeInTheDocument();
  });

  it("11. le champ des droits d'inscription reste éditable quand Stripe est opérationnel", async () => {
    render(<EditTournamentForm tournament={tournament()} canReceivePayments={true} stripeConnectUrl={STRIPE_URL} />);
    await openForm();

    const entryFeeInput = screen.getByLabelText(/droits d'inscription/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();
    expect(screen.queryByText(/nécessite un compte stripe connect opérationnel/i)).not.toBeInTheDocument();
  });
});
