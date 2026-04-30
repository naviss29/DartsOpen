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

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateTournamentStatus(tournamentId, nextStatus as TournamentStatus);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : label}
      </button>
      {error && (
        <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>
      )}
    </div>
  );
}
