"use client";

import { useActionState, useState } from "react";
import { generatePools } from "@/lib/actions/pool";

interface Props {
  tournamentId: string;
  hasPools: boolean;
  nbPoolsConfigured: number;
  effectivePools: number;
  /** Au moins un match de poule déjà terminé — la régénération doit rester impossible. */
  hasFinishedMatch: boolean;
}

export function GeneratePoolsButton({ tournamentId, hasPools, nbPoolsConfigured, effectivePools, hasFinishedMatch }: Props) {
  const [state, action, isPending] = useActionState(
    generatePools.bind(null, tournamentId),
    null
  );
  const [ackDestructive, setAckDestructive] = useState(false);

  const poolsReduced = effectivePools < nbPoolsConfigured;
  const isRegeneration = hasPools;

  if (hasFinishedMatch) {
    return (
      <div className="flex flex-col items-end gap-2 max-w-xs">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-right">
          Régénération impossible : des matchs de poule sont déjà terminés. Les résultats déjà entrés ne peuvent pas être écrasés.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {poolsReduced && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-right max-w-xs">
          ⚠️ Avec les équipes actuellement inscrites, seules <strong>{effectivePools} poule{effectivePools > 1 ? "s" : ""}</strong> seront créées au lieu de {nbPoolsConfigured}.
        </p>
      )}

      {isRegeneration && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 max-w-xs space-y-2">
          <p className="text-sm text-red-700">
            ⚠️ Régénérer supprimera <strong>toutes les poules et matchs actuels</strong> (y compris les scores déjà saisis) et redistribuera les équipes aléatoirement. Cette action est irréversible.
          </p>
          <label className="flex items-start gap-2 text-sm text-red-700 cursor-pointer">
            <input
              type="checkbox"
              checked={ackDestructive}
              onChange={(e) => setAckDestructive(e.target.checked)}
              className="mt-0.5"
            />
            Je comprends et je confirme la régénération.
          </label>
        </div>
      )}

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
      <form action={action}>
        <button
          type="submit"
          disabled={isPending || (isRegeneration && !ackDestructive)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Génération…" : hasPools ? "Regénérer les poules" : "Générer les poules"}
        </button>
      </form>
    </div>
  );
}
