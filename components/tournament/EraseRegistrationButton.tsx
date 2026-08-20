"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@naviss29/design-system";
import { eraseRegistration } from "@/lib/actions/player";

/**
 * Effacement (BAPPS-LEGAL-005 §8) — anonymise ou supprime une inscription selon
 * qu'elle est déjà engagée dans des matchs/poules (voir `dbEraseRegistration`).
 * Action destructive et non réversible : confirmation explicite avant d'agir.
 *
 * DO-BETA-UX-001 — `window.confirm()` natif remplacé par `ConfirmDialog` (DS) : seul pattern
 * canonique de confirmation destructive de l'écosystème (UX-UI-Standards.md §3), pas une
 * boîte de dialogue navigateur non stylée et jamais accessible au clavier de façon cohérente.
 */
export function EraseRegistrationButton({ registrationId, tournamentId }: { registrationId: string; tournamentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    return new Promise<void>((resolve) => {
      setError(null);
      startTransition(async () => {
        const res = await eraseRegistration(registrationId, tournamentId);
        if (res?.error) setError(res.error);
        setOpen(false);
        resolve();
      });
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "…" : "Effacer les données"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}

      <ConfirmDialog
        open={open}
        title="Effacer les données de ce joueur ?"
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        confirmLabel="Effacer"
        confirmingLabel="Effacement…"
      >
        Cette action est irréversible : les données personnelles de ce joueur seront anonymisées
        ou supprimées.
      </ConfirmDialog>
    </span>
  );
}
