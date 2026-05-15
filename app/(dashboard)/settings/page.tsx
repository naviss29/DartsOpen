import { getUser } from "@/lib/api/auth";
import { redirect } from "next/navigation";
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

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">Mon compte</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="text-gray-500">Email :</span> {user.email}</p>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Paiements Stripe</h2>
          <span className="rounded-full px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600">
            Non connecté
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Connectez votre compte Stripe pour recevoir les droits d&apos;inscription directement sur votre compte bancaire.
          La plateforme retient <strong>0,10 € par inscription</strong> comme frais de service.
        </p>
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          La connexion Stripe sera disponible après la migration complète vers SterPlatform (Phase 5c).
        </p>
      </section>
    </div>
  );
}
