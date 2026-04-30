"use client";

import { removePlayer } from "@/lib/actions/player";
import { useTransition } from "react";

export function RemovePlayerButton({ registrationId, tournamentId }: { registrationId: string; tournamentId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => removePlayer(registrationId, tournamentId))}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? "…" : "Retirer"}
    </button>
  );
}
