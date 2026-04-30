import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { createStripeOnboardingLink } from "@/lib/actions/stripe";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Paramètres — DartsOpen" };

async function handleOnboarding() {
  "use server";
  const result = await createStripeOnboardingLink();
  if (result.url) redirect(result.url);
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: association } = await supabase
    .from("associations")
    .select("name, email, stripe_account_id")
    .eq("id", user!.id)
    .single();

  let stripeStatus: "not_connected" | "pending" | "active" = "not_connected";

  if (association?.stripe_account_id) {
    const account = await stripe.accounts.retrieve(association.stripe_account_id);
    stripeStatus = account.charges_enabled ? "active" : "pending";
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-1">Gérez votre compte et votre connexion Stripe.</p>
      </div>

      {/* Infos association */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">Mon association</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="text-gray-500">Nom :</span> {association?.name}</p>
          <p><span className="text-gray-500">Email :</span> {association?.email}</p>
        </div>
      </section>

      {/* Stripe Connect */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Paiements Stripe</h2>
          <StripeStatusBadge status={stripeStatus} />
        </div>

        <p className="text-sm text-gray-600">
          Connectez votre compte Stripe pour recevoir les droits d&apos;inscription directement sur votre compte bancaire. La plateforme retient <strong>0,10 € par inscription</strong> comme frais de service.
        </p>

        {stripeStatus === "active" && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            Votre compte Stripe est actif. Les paiements des joueurs vous seront reversés automatiquement.
          </div>
        )}

        {stripeStatus === "pending" && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700">
            Votre compte Stripe est en cours de validation. Finalisez le processus d&apos;intégration pour activer les paiements.
          </div>
        )}

        {stripeStatus !== "active" && (
          <form action={handleOnboarding}>
            <button
              type="submit"
              className="rounded-lg bg-[#635BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5851e8] transition-colors"
            >
              {stripeStatus === "pending" ? "Finaliser l'intégration Stripe →" : "Connecter mon compte Stripe →"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function StripeStatusBadge({ status }: { status: "not_connected" | "pending" | "active" }) {
  const config = {
    not_connected: { label: "Non connecté", className: "bg-gray-100 text-gray-600" },
    pending: { label: "En attente", className: "bg-yellow-100 text-yellow-700" },
    active: { label: "Actif", className: "bg-green-100 text-green-700" },
  };
  const { label, className } = config[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>
  );
}
