"use client";

import { useActionState, useState } from "react";
import { generatePools } from "@/lib/actions/pool";
import { Alert } from "@naviss29/design-system";
import Button from "@/components/ui/Button";

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
      <div className="max-w-xs">
        <Alert tone="error">
          Régénération impossible : des matchs de poule sont déjà terminés. Les résultats déjà entrés ne peuvent pas être écrasés.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {poolsReduced && (
        <div className="max-w-xs">
          <Alert tone="warning">
            Avec les équipes actuellement inscrites, seules <strong>{effectivePools} poule{effectivePools > 1 ? "s" : ""}</strong> seront créées au lieu de {nbPoolsConfigured}.
          </Alert>
        </div>
      )}

      {isRegeneration && (
        <div className="rounded-lg bg-danger-subtle border border-danger-border p-3 max-w-xs space-y-2">
          <p className="text-sm text-danger">
            ⚠️ Régénérer supprimera <strong>toutes les poules et matchs actuels</strong> (y compris les scores déjà saisis) et redistribuera les équipes aléatoirement. Cette action est irréversible.
          </p>
          <label className="flex items-start gap-2 text-sm text-danger cursor-pointer">
            <input
              type="checkbox"
              checked={ackDestructive}
              onChange={(e) => setAckDestructive(e.target.checked)}
              className="mt-0.5 accent-danger-solid"
            />
            Je comprends et je confirme la régénération.
          </label>
        </div>
      )}

      {state?.error && (
        <div className="max-w-xs">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      <form action={action}>
        <Button type="submit" disabled={isPending || (isRegeneration && !ackDestructive)}>
          {isPending ? "Génération…" : hasPools ? "Regénérer les poules" : "Générer les poules"}
        </Button>
      </form>
    </div>
  );
}
