"use client";

import { useActionState } from "react";
import { generatePools } from "@/lib/actions/pool";

interface Props {
  tournamentId: string;
  hasPools: boolean;
  nbPoolsConfigured: number;
  effectivePools: number;
}

export function GeneratePoolsButton({ tournamentId, hasPools, nbPoolsConfigured, effectivePools }: Props) {
  const [state, action, isPending] = useActionState(
    generatePools.bind(null, tournamentId),
    null
  );

  const poolsReduced = effectivePools < nbPoolsConfigured;

  return (
    <div className="flex flex-col items-end gap-2">
      {poolsReduced && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-right max-w-xs">
          ⚠️ Avec les équipes actuellement inscrites, seules <strong>{effectivePools} poule{effectivePools > 1 ? "s" : ""}</strong> seront créées au lieu de {nbPoolsConfigured}.
        </p>
      )}
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
      <form action={action}>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isPending ? "Génération…" : hasPools ? "Regénérer les poules" : "Générer les poules"}
        </button>
      </form>
    </div>
  );
}
