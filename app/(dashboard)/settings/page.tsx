import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
import { Alert, Pill } from "@naviss29/design-system";
import Card from "@/components/ui/Card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Paramètres — DartsOpen" };

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-1">Gérez votre compte et votre connexion Stripe.</p>
      </div>

      <Card as="section" className="space-y-3">
        <h2 className="font-semibold text-gray-900">Mon compte</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="text-gray-500">Email :</span> {user.email}</p>
        </div>
      </Card>

      <Card as="section" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Paiements Stripe</h2>
          <Pill tone="neutral">Non connecté</Pill>
        </div>
        <p className="text-sm text-gray-600">
          Connectez votre compte Stripe pour recevoir les droits d&apos;inscription directement sur votre compte bancaire.
          La plateforme retient <strong>0,10 € par inscription</strong> comme frais de service.
        </p>
        <Alert tone="warning">
          La connexion Stripe sera disponible après la migration complète vers SterPlatform (Phase 5c).
        </Alert>
      </Card>
    </div>
  );
}
