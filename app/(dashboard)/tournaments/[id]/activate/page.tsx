import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PaypalActivateButton } from "@/components/tournament/PaypalActivateButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activer le tournoi — DartsOpen" };

interface Props { params: Promise<{ id: string }> }

export default async function ActivatePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, max_players, players_per_team, registration_mode, association_id")
    .eq("id", id)
    .eq("association_id", user!.id)
    .single();

  if (!tournament) notFound();

  const platformFeeEuros = tournament.max_players * 0.10;

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tournoi créé ✓</h1>
        <p className="text-sm text-gray-500 mt-1">{tournament.name}</p>
      </div>

      {/* Frais plateforme */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Frais de plateforme</h2>
        <p className="text-sm text-gray-600">
          DartsOpen facture{" "}<strong>0,10 € par joueur</strong>{" "}pour couvrir l&apos;hébergement et le développement de la plateforme.
        </p>

        <PaypalActivateButton baseFeeEuros={platformFeeEuros} maxPlayers={tournament.max_players} />
        <p className="text-xs text-center text-gray-400">Merci pour votre soutien !</p>
      </div>

      {/* Mode inscription sur place */}
      {tournament.registration_mode === "ONSITE" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 space-y-1">
          <p className="font-medium">📍 Mode : inscriptions sur place uniquement</p>
          <p>
            Les visiteurs verront un message les invitant à s&apos;inscrire directement lors de l&apos;événement.
            Chaque inscription manuelle vous coûtera{" "}<strong>0,10 € × joueurs par équipe</strong>{" "}en frais plateforme, réglés ici à l&apos;avance.
          </p>
        </div>
      )}

      <Link
        href={`/tournaments/${id}`}
        className="block rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white text-center hover:bg-green-700 transition-colors"
      >
        Continuer vers mon tournoi →
      </Link>
    </div>
  );
}
