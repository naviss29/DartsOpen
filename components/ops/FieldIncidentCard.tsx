"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resolveOtherIncident } from "@/lib/actions/fieldIncident";
import { ForfeitControl } from "@/components/tournament/ForfeitControl";
import type { FieldIncidentListItem } from "@/lib/db/fieldIncident";

const TYPE_LABEL: Record<FieldIncidentListItem["type"], string> = {
  PLAYER_ABSENT: "Joueur absent",
  RESULT_DISPUTED: "Résultat contesté",
  OTHER: "Autre",
};

const REPORTER_LABEL: Record<FieldIncidentListItem["reported_by"], string> = {
  PLAYER: "signalé par un joueur",
  REFEREE: "signalé par l'arbitre",
  ORGANIZER: "signalé par l'organisation",
};

/**
 * DO-FIELD-INCIDENT-001 (Étape 5, Étape 11) — une carte tactile par incident OPEN, jamais un
 * tableau : l'action possible dépend du type et reste réduite à 1-2 boutons, lisible en
 * portrait mobile. La désignation du gagnant par forfait passe par declareForfeit()
 * (lib/actions/fieldIncident.ts), qui délègue à dbDeclareForfeit — jamais recalculée ici.
 */
export function FieldIncidentCard({ tournamentId, incident }: { tournamentId: string; incident: FieldIncidentListItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleResolveOther() {
    setError(null);
    startTransition(async () => {
      const result = await resolveOtherIncident(tournamentId, incident.match_id, incident.id);
      if (result.error) setError(result.error);
    });
  }

  const matchLabel = `${incident.player1_name} vs ${incident.player2_name ?? "?"}`;
  const arbitrationHref = incident.pool_id
    ? `/tournaments/${tournamentId}/pools`
    : `/tournaments/${tournamentId}/bracket`;

  return (
    <div className="rounded-xl border border-warning-border bg-warning-subtle p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-brand-dark">{TYPE_LABEL[incident.type]}</p>
        <p className="text-xs text-brand-text-secondary">
          Cible {incident.board_number || "—"} · {REPORTER_LABEL[incident.reported_by]}
        </p>
      </div>
      <p className="text-sm text-brand-dark">{matchLabel}</p>
      {incident.comment && <p className="text-xs text-brand-text-secondary italic">« {incident.comment} »</p>}

      <div className="pt-1">
        {incident.type === "PLAYER_ABSENT" && incident.player2_id && (
          <ForfeitControl
            tournamentId={tournamentId}
            matchId={incident.match_id}
            player1Id={incident.player1_id}
            player1Name={incident.player1_name}
            player2Id={incident.player2_id}
            player2Name={incident.player2_name ?? "?"}
          />
        )}

        {incident.type === "RESULT_DISPUTED" && (
          <Link
            href={arbitrationHref}
            className="inline-block rounded-lg border border-warning-border px-3 py-2 text-xs font-semibold text-warning hover:bg-warning-subtle"
          >
            Arbitrer ce match →
          </Link>
        )}

        {incident.type === "OTHER" && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleResolveOther}
            className="rounded-lg border border-warning-border px-3 py-2 text-xs font-semibold text-warning hover:bg-warning-subtle disabled:opacity-60"
          >
            {isPending ? "…" : "Marquer résolu"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger-solid">{error}</p>}
    </div>
  );
}
