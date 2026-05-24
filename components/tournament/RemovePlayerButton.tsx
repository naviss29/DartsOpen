"use client";

import { removePlayer } from "@/lib/actions/player";
import { useState, useTransition } from "react";

export function RemovePlayerButton({ registrationId, tournamentId }: { registrationId: string; tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await removePlayer(registrationId, tournamentId);
            if (res?.error) setError(res.error);
          });
        }}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Retirer"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
