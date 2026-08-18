"use client";

import { retryTournamentEntitlementConfirmation } from "@/lib/actions/tournament";
import { useState, useTransition } from "react";

/**
 * DARTSOPEN-MONETIZATION-003 (P2/P3, contre-audit) — seule affordance UI pour réconcilier un
 * tournoi resté PENDING_ENTITLEMENT (crédit tournoi indéterminé lors de la création) une fois
 * l'organisateur reparti de la page de création elle-même (qui gère déjà la ré-soumission du
 * même formulaire). Voir retryTournamentEntitlementConfirmation(), lib/actions/tournament.ts.
 */
export function RetryEntitlementButton({ tournamentId }: { tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await retryTournamentEntitlementConfirmation(tournamentId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Vérification…" : "Réessayer la confirmation"}
      </button>
      {error && <p className="text-xs text-red-600 max-w-sm">{error}</p>}
    </div>
  );
}
