import { redirect } from "next/navigation";
import { Alert } from "@naviss29/design-system";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { getUser } from "@/lib/api/auth";
import { getOnlinePaymentUiState } from "@/lib/payments/onlinePaymentGuard";
import { getTournamentSizeUiState } from "@/lib/entitlements/tournamentSizeGuard";
import { resolveTournamentCreationTarget } from "@/lib/auth/organizationAccess";
import { billingSourceForCreation } from "@/lib/organizations/billingOrganization";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau tournoi — DartsOpen" };

const BSSITE_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? "https://bapps-studio.com";

export default async function NewTournamentPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // ADR-0021 / L7 — Stripe Connect et crédits de l'organisation où le tournoi naîtra : même
  // résolution que createTournament() (organisation courante OWNER/ADMIN, sinon création sans
  // organisation ⇒ liaison locale de l'utilisateur, D3). Création refusée (MEMBER, plusieurs
  // organisations sans choix, rôle invérifiable) ⇒ aucune organisation interrogée, et le motif
  // (déjà traduit) est affiché d'emblée plutôt qu'après une saisie complète du formulaire.
  const target = await resolveTournamentCreationTarget();
  const billingSource = target.ok ? billingSourceForCreation(user.id, target.organization) : null;

  const [{ status: stripeConnectStatus, organizationSlug }, sizeState] = await Promise.all([
    getOnlinePaymentUiState(billingSource),
    getTournamentSizeUiState(billingSource),
  ]);
  const stripeConnectUrl = organizationSlug ? `${BSSITE_URL}/dashboard/organisations/${organizationSlug}/stripe` : `${BSSITE_URL}/dashboard`;
  const subscriptionUrl = organizationSlug ? `${BSSITE_URL}/dashboard/organisations/${organizationSlug}/abonnement/dartsopen` : `${BSSITE_URL}/dashboard`;
  const creditPurchaseUrl = organizationSlug ? `${BSSITE_URL}/dashboard/organisations/${organizationSlug}/credits/dartsopen` : `${BSSITE_URL}/dashboard`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Nouveau tournoi</h1>
        <p className="text-sm text-brand-text-secondary mt-1">
          Les manches (type de jeu, entrée, sortie) seront configurées après la création.
        </p>
      </div>
      {!target.ok && <Alert tone="warning">{target.error}</Alert>}
      <TournamentForm
        stripeConnectStatus={stripeConnectStatus}
        stripeConnectUrl={stripeConnectUrl}
        hasActiveSubscription={sizeState.hasActiveSubscription}
        availableCredits={sizeState.availableCredits}
        subscriptionUrl={subscriptionUrl}
        creditPurchaseUrl={creditPurchaseUrl}
      />
    </div>
  );
}
