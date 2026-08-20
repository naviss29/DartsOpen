"use client";

import { useState, useTransition } from "react";
import { declareForfeit } from "@/lib/actions/fieldIncident";

/**
 * DO-FIELD-INCIDENT-001 (Étape 4 Cas A, Étape 5) — contrôle partagé de déclaration de forfait,
 * utilisé à la fois côté Pilotage (organisateur, voir FieldIncidentCard) et côté terrain
 * (arbitre, voir ScoreForm) : même geste, même appel serveur (declareForfeit →
 * dbDeclareForfeit), jamais une seconde implémentation. L'autorisation réelle reste
 * entièrement serveur (authorizeScoring + garde ORGANIZER/REFEREE dans declareForfeit) — ce
 * composant n'est jamais lui-même une barrière de sécurité.
 */
export function ForfeitControl({
  tournamentId,
  matchId,
  player1Id,
  player1Name,
  player2Id,
  player2Name,
}: {
  tournamentId: string;
  matchId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);

  function handleForfeit(absentPlayerId: string) {
    setError(null);
    startTransition(async () => {
      const result = await declareForfeit(tournamentId, matchId, absentPlayerId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return <p className="text-xs font-medium text-brand-turquoise">Forfait enregistré.</p>;
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
      >
        Déclarer un forfait
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-text-primary">Quel joueur est absent ?</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleForfeit(player1Id)}
          className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {player1Name} forfait
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleForfeit(player2Id)}
          className="rounded-lg border border-red-400 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {player2Name} forfait
        </button>
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-text-secondary underline">
          Annuler
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
