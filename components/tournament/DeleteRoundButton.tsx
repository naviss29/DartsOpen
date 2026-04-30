"use client";

import { deleteRound } from "@/lib/actions/tournament";
import { useTransition } from "react";

interface Props {
  roundId: string;
  tournamentId: string;
}

export function DeleteRoundButton({ roundId, tournamentId }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteRound(roundId, tournamentId))}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? "…" : "Supprimer"}
    </button>
  );
}
