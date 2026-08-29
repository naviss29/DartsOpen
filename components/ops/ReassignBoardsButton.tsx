"use client";

import { useState, useTransition } from "react";
import { reassignFreeBoards } from "@/lib/actions/tournamentOps";
import Button from "@/components/ui/Button";

/**
 * DO-OPS-001 — bouton d'action pour l'incident "cible libre alors que des matchs attendent"
 * (lib/ops/tournamentConsole.ts::detectIncidents). Appelle reassignFreeBoards() (lib/actions/
 * tournamentOps.ts), qui ne fait qu'exposer la même affectation automatique déjà utilisée en
 * interne par le moteur sportif — jamais une nouvelle règle d'affectation de cibles.
 */
export function ReassignBoardsButton({ tournamentId }: { tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await reassignFreeBoards(tournamentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "Réaffectation…" : "Réaffecter les cibles libres"}
      </Button>
      {error && <p className="text-xs text-danger-solid">{error}</p>}
      {done && !error && <p className="text-xs text-brand-turquoise">Cibles réaffectées.</p>}
    </div>
  );
}
