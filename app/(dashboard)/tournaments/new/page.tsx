import { redirect } from "next/navigation";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { getUser } from "@/lib/api/auth";
import { getOnlinePaymentUiState } from "@/lib/payments/onlinePaymentGuard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau tournoi — DartsOpen" };

const BSSITE_URL = process.env.NEXT_PUBLIC_BSSITE_URL ?? "https://bapps-studio.com";

export default async function NewTournamentPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const { canReceivePayments, organizationSlug } = await getOnlinePaymentUiState(user.id);
  const stripeConnectUrl = organizationSlug ? `${BSSITE_URL}/dashboard/organisations/${organizationSlug}/stripe` : `${BSSITE_URL}/dashboard`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Nouveau tournoi</h1>
        <p className="text-sm text-brand-text-secondary mt-1">
          Les manches (type de jeu, entrée, sortie) seront configurées après la création.
        </p>
      </div>
      <TournamentForm canReceivePayments={canReceivePayments} stripeConnectUrl={stripeConnectUrl} />
    </div>
  );
}
