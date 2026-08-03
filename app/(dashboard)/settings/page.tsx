import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
import { Alert, Card, Pill } from "@naviss29/design-system";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Paramètres — DartsOpen" };

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Paramètres</h1>
        <p className="text-sm text-brand-text-secondary mt-1">Gérez votre compte et votre connexion Stripe.</p>
      </div>

      <section>
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand-dark">Mon compte</h2>
          <div className="text-sm text-brand-dark space-y-1">
            <p><span className="text-brand-text-secondary">Email :</span> {user.email}</p>
          </div>
        </Card>
      </section>

      <section>
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-dark">Paiements Stripe</h2>
            <Pill tone="neutral">Non disponible</Pill>
          </div>
          <p className="text-sm text-brand-text-secondary">
            Les droits d&apos;inscription payants ne peuvent pas encore être reversés directement sur un compte
            bancaire d&apos;organisateur. La plateforme retient <strong>0,10 € par inscription</strong> comme
            frais de service.
          </p>
          <Alert tone="info">
            Le versement des droits d&apos;inscription à l&apos;organisateur n&apos;est pas encore disponible.
          </Alert>
        </Card>
      </section>
    </div>
  );
}
