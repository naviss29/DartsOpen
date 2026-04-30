"use client";

import { updateTournamentStatus } from "@/lib/actions/tournament";
import { useTransition } from "react";
import type { TournamentStatus } from "@/types";

interface Props {
  tournamentId: string;
  nextStatus: string;
  label: string;
}

export function TournamentStatusButton({ tournamentId, nextStatus, label }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(() => updateTournamentStatus(tournamentId, nextStatus as TournamentStatus))
      }
      disabled={isPending}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {isPending ? "…" : label}
    </button>
  );
}
