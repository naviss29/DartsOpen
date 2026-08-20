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
} as const;

describe("TournamentForm — droits d'inscription et mode de paiement (DARTSOPEN-MONETIZATION-001/002)", () => {
  it("le champ des droits d'inscription reste éditable même quand Stripe n'est pas opérationnel (mission §7 — jamais forcé à 0)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    expect(entryFeeInput).not.toBeDisabled();

    fireEvent.change(entryFeeInput, { target: { value: "5" } });
    expect(entryFeeInput.value).toBe("5");
  });

  it("sans Stripe opérationnel : une information sobre indique un règlement sur place, jamais un bandeau anxiogène (DO-STABILIZATION-001, Problème 2)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "5" } });

    expect(screen.getByText(/paiement des inscriptions : sur place/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /configurer stripe connect/i });
    expect(cta).toHaveAttribute("href", STRIPE_URL);
  });

  it("sans Stripe opérationnel : aucun choix de mode de paiement en ligne/sur place n'est affiché (mission §6, CASE B)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "5" } });

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
  });

  it("avec Stripe opérationnel et des droits positifs : propose un choix explicite de mode de paiement (mission §6, CASE A)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="OPERATIONAL" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "10" } });

    expect(screen.getByText(/mode de paiement/i)).toBeInTheDocument();
    const radios = screen.getAllByRole("radio").filter((el) => (el as HTMLInputElement).name === "payment_mode");
    expect(radios).toHaveLength(2);
  });

  it("aucun choix de mode de paiement n'est affiché pour un tournoi gratuit, même avec Stripe opérationnel", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="OPERATIONAL" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i) as HTMLInputElement;
    fireEvent.change(entryFeeInput, { target: { value: "0" } });

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
  });

  it("le mode d'inscription en ligne reste sélectionnable même sans Stripe (indépendant du mode de paiement, mission §5)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const onlineRadio = screen.getAllByRole("radio").find((el) => (el as HTMLInputElement).value === "ONLINE" && (el as HTMLInputElement).name === "registration_mode");
    expect(onlineRadio).not.toBeDisabled();
  });

  it("DO-STABILIZATION-001 (Problème 2) : un statut indéterminé est traité comme NOT_OPERATIONAL — aucun choix, aucun bandeau 'momentanément indisponible', la même information sobre", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="INDETERMINATE" />);

    const entryFeeInput = screen.getByLabelText(/droits d'inscription \(/i);
    fireEvent.change(entryFeeInput, { target: { value: "5" } });

    expect(screen.queryByText(/mode de paiement/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/momentanément indisponible/i)).not.toBeInTheDocument();
    expect(screen.getByText(/paiement des inscriptions : sur place/i)).toBeInTheDocument();
  });
});

describe("TournamentForm — idempotence (DARTSOPEN-MONETIZATION-002, audit DO-AUD-001/DO-AUD-002)", () => {
  it("génère une clé d'idempotence stable, identique entre deux rendus du même formulaire", () => {
    const { unmount } = render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);
    const firstKey = (document.querySelector('input[name="idempotency_key"]') as HTMLInputElement).value;
    expect(firstKey).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/nombre de joueurs max/i), { target: { value: "20" } });
    const keyAfterInteraction = (document.querySelector('input[name="idempotency_key"]') as HTMLInputElement).value;
    expect(keyAfterInteraction).toBe(firstKey);

    unmount();
  });

  it("génère une nouvelle clé pour une nouvelle instance du formulaire (nouveau chargement de page)", () => {
    const { unmount: unmountA } = render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);
    const keyA = (document.querySelector('input[name="idempotency_key"]') as HTMLInputElement).value;
    unmountA();

    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);
    const keyB = (document.querySelector('input[name="idempotency_key"]') as HTMLInputElement).value;

    expect(keyB).not.toBe(keyA);
  });
});

describe("TournamentForm — règle des 10 joueurs (DO-STABILIZATION-001, Problème 1)", () => {
  it("sans entitlement confirmé : le défaut est plafonné à 10 (jamais 16), avec rappel du palier gratuit", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    expect(maxPlayersInput.value).toBe("10");
    expect(maxPlayersInput.max).toBe("10");
    expect(screen.getByText(/jusqu'à 10 joueurs/i)).toBeInTheDocument();
  });

  it("avec un abonnement actif : le défaut reste 16, le plafond du champ passe à 512", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" hasActiveSubscription={true} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    expect(maxPlayersInput.value).toBe("16");
    expect(maxPlayersInput.max).toBe("512");
  });

  it("avec un crédit tournoi disponible : le défaut reste 16, le plafond du champ passe à 512", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" availableCredits={1} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    expect(maxPlayersInput.value).toBe("16");
    expect(maxPlayersInput.max).toBe("512");
  });

  it("propose 1 poule et 2 cibles par défaut", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    expect((screen.getByLabelText(/nombre de poules/i) as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText(/nombre de cibles disponibles/i) as HTMLInputElement).value).toBe("2");
  });

  it("propose aussi 10 joueurs (plafonné) et 2 cibles par défaut en mode rapide, sans entitlement", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    fireEvent.click(screen.getByRole("switch"));

    expect((screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText(/nombre de cibles disponibles/i) as HTMLInputElement).value).toBe("2");
  });

  it("impossible de saisir au-delà de 10 sans entitlement : la valeur est clampée en temps réel, jamais soumise telle quelle (DO-STABILIZATION-001)", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "16" } });

    expect(maxPlayersInput.value).toBe("10"); // clampé, jamais 16
  });

  it("l'incitation à l'accès payant reste visible même à la valeur plafond (10), jamais un simple texte réactif contournable", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" />);

    expect(screen.getByText(/accès payant dartsopen/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crédit tournoi/i })).toHaveAttribute("href", CREDIT_URL);
    expect(screen.getByRole("link", { name: /abonnement dartsopen/i })).toHaveAttribute("href", SUBSCRIPTION_URL);
  });

  it("aucune option payante affichée, et aucun clamp appliqué, quand un abonnement actif existe déjà", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" hasActiveSubscription={true} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(maxPlayersInput.value).toBe("32"); // jamais clampé : entitlement confirmé
    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });

  it("aucune option payante affichée, et aucun clamp appliqué, quand un crédit est disponible", () => {
    render(<TournamentForm {...defaultProps} stripeConnectStatus="NOT_OPERATIONAL" availableCredits={1} />);

    const maxPlayersInput = screen.getByLabelText(/nombre de joueurs max/i) as HTMLInputElement;
    fireEvent.change(maxPlayersInput, { target: { value: "32" } });

    expect(maxPlayersInput.value).toBe("32");
    expect(screen.queryByText(/accès payant dartsopen/i)).not.toBeInTheDocument();
  });
});
