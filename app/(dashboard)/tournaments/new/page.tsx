import { TournamentForm } from "@/components/tournament/TournamentForm";
import { StripeInfoModal } from "@/components/tournament/StripeInfoModal";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau tournoi — DartsOpen" };

export default async function NewTournamentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: association } = await supabase
    .from("associations")
    .select("stripe_account_id")
    .eq("id", user!.id)
    .single();

  let stripeConnected = false;
  if (association?.stripe_account_id) {
    const account = await stripe.accounts.retrieve(association.stripe_account_id);
    stripeConnected = account.charges_enabled;
  }

  return (
    <div className="space-y-6">
      <StripeInfoModal stripeConnected={stripeConnected} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau tournoi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Les manches (type de jeu, entrée, sortie) seront configurées après la création.
        </p>
      </div>
      <TournamentForm />
    </div>
  );
}
