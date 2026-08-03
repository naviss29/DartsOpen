import { Alert } from "@naviss29/design-system";
import { PaypalActivateButton } from "@/components/tournament/PaypalActivateButton";
import { getOwnedTournament } from "@/lib/actions/access";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activer le tournoi — DartsOpen" };

interface Props { params: Promise<{ id: string }> }

type Tournament = {
  id: string;
  name: string;
  max_players: number;
  players_per_team: number;
  registration_mode: string;
};

export default async function ActivatePage({ params }: Props) {
  const { id } = await params;
  const tournament = await getOwnedTournament(id) as Tournament;

  const platformFeeEuros = tournament.max_players * 0.10;

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tournoi créé ✓</h1>
        <p className="text-sm text-gray-500 mt-1">{tournament.name}</p>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold text-gray-900">Frais de plateforme</h2>
        <p className="text-sm text-gray-600">
          DartsOpen facture{" "}<strong>0,10 € par joueur</strong>{" "}pour couvrir l&apos;hébergement et le développement de la plateforme.
        </p>

        <PaypalActivateButton baseFeeEuros={platformFeeEuros} maxPlayers={tournament.max_players} />
        <p className="text-xs text-center text-gray-400">Merci pour votre soutien !</p>
      </Card>

      {tournament.registration_mode === "ONSITE" && (
        <Alert tone="warning">
          <p className="font-medium">📍 Mode : inscriptions sur place uniquement</p>
          <p>
            Les visiteurs verront un message les invitant à s&apos;inscrire directement lors de l&apos;événement.
            Chaque inscription manuelle vous coûtera{" "}<strong>0,10 € × joueurs par équipe</strong>{" "}en frais plateforme, réglés ici à l&apos;avance.
          </p>
        </Alert>
      )}

      <Button href={`/tournaments/${id}`} className="w-full justify-center">
        Continuer vers mon tournoi →
      </Button>
    </div>
  );
}
