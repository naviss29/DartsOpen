"use client";

import { updateTournamentStatus } from "@/lib/actions/tournament";
import { useState, useTransition } from "react";
import type { TournamentStatus } from "@/types";

interface Props {
  tournamentId: string;
  nextStatus: string;
  label: string;
}

export function TournamentStatusButton({ tournamentId, nextStatus, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ackFinish, setAckFinish] = useState(false);

  const isFinishing = nextStatus === "FINISHED";

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateTournamentStatus(tournamentId, nextStatus as TournamentStatus);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {isFinishing && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 max-w-xs space-y-2">
          <p className="text-sm text-red-700">
            ⚠️ Clôturer le tournoi coupera immédiatement la saisie des scores pour tous les matchs en cours. Cette action est irréversible.
          </p>
          <label className="flex items-start gap-2 text-sm text-red-700 cursor-pointer">
            <input
              type="checkbox"
              checked={ackFinish}
              onChange={(e) => setAckFinish(e.target.checked)}
              className="mt-0.5"
            />
            Je comprends et je confirme la clôture.
          </label>
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={isPending || (isFinishing && !ackFinish)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : label}
      </button>
      {error && (
        <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>
      )}
    </div>
  );
}
