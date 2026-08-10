"use client";

import { useState, useTransition } from "react";
import { eraseRegistration } from "@/lib/actions/player";

/**
 * Effacement (BAPPS-LEGAL-005 §8) — anonymise ou supprime une inscription selon
 * qu'elle est déjà engagée dans des matchs/poules (voir `dbEraseRegistration`).
 * Action destructive et non réversible : confirmation explicite avant d'agir.
 */
export function EraseRegistrationButton({ registrationId, tournamentId }: { registrationId: string; tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("Effacer les données personnelles de ce joueur ? Cette action est irréversible.")) return;
    setError(null);
    startTransition(async () => {
      const res = await eraseRegistration(registrationId, tournamentId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Effacer les données"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
