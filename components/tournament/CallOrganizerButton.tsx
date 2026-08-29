"use client";

import { useState, useTransition } from "react";
import { reportFieldIncident } from "@/lib/actions/fieldIncident";
import type { FieldIncidentType } from "@/lib/generated/prisma/client";

const REPORT_OPTIONS: { type: FieldIncidentType; label: string }[] = [
  { type: "PLAYER_ABSENT", label: "Joueur absent" },
  { type: "RESULT_DISPUTED", label: "Résultat contesté" },
  { type: "OTHER", label: "Autre" },
];

/**
 * DO-FIELD-INCIDENT-001 (Étape 3, Étape 11) — "Appeler l'organisation", accessible aux trois
 * profils (PLAYER/REFEREE/ORGANIZER, l'autorisation réelle vient de authorizeScoring côté
 * serveur, jamais de ce composant). Ne modifie JAMAIS un résultat sportif : crée uniquement un
 * incident OPEN, visible dans Pilotage. Repli inline (pas de modale plein écran), tactile,
 * utilisable en portrait mobile.
 */
export function CallOrganizerButton({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleReport(type: FieldIncidentType) {
    setError(null);
    startTransition(async () => {
      const result = await reportFieldIncident(tournamentId, matchId, type, comment || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-brand-turquoise/40 bg-brand-turquoise/5 p-3 text-center">
        <p className="text-sm font-medium text-brand-dark">Organisation prévenue.</p>
        <p className="text-xs text-text-secondary">Un responsable va intervenir sur cette cible.</p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-warning-border bg-warning-subtle px-4 py-3 text-sm font-semibold text-warning hover:bg-warning-subtle"
      >
        📣 Appeler l&apos;organisation
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-warning-border bg-warning-subtle p-4 space-y-3">
      <p className="text-sm font-semibold text-warning">Quel est le problème ?</p>
      <div className="flex flex-col gap-2">
        {REPORT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            type="button"
            disabled={isPending}
            onClick={() => handleReport(opt.type)}
            className="w-full rounded-lg border border-warning-border bg-surface px-4 py-3 text-left text-sm font-medium text-warning hover:bg-warning-subtle disabled:opacity-60"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="Précision (facultatif)"
        className="w-full rounded-lg border border-warning-border bg-surface px-3 py-2 text-sm"
      />
      <button type="button" onClick={() => setExpanded(false)} className="text-xs text-warning underline">
        Annuler
      </button>
      {error && <p className="text-xs text-danger-solid">{error}</p>}
    </div>
  );
}
