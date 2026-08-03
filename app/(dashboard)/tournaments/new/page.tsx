import { TournamentForm } from "@/components/tournament/TournamentForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nouveau tournoi — DartsOpen" };

export default function NewTournamentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Nouveau tournoi</h1>
        <p className="text-sm text-brand-text-secondary mt-1">
          Les manches (type de jeu, entrée, sortie) seront configurées après la création.
        </p>
      </div>
      <TournamentForm />
    </div>
  );
}
