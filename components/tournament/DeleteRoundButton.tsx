"use client";

import { deleteRound } from "@/lib/actions/tournament";
import { useState, useTransition } from "react";

interface Props {
  roundId: string;
  tournamentId: string;
}

export function DeleteRoundButton({ roundId, tournamentId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await deleteRound(roundId, tournamentId);
            if (res?.error) setError(res.error);
          });
        }}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Supprimer"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
