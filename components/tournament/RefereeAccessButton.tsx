"use client";

import { useState, useTransition } from "react";
import { generateRefereeAccess } from "@/lib/actions/fieldReferee";

/**
 * DO-FIELD-ACCESS-002 — génère la preuve arbitre à la demande (jamais pré-générée au chargement
 * de la page) : chaque clic crée une nouvelle `FieldRefereeGrant` à usage unique côté serveur
 * (organisateur déjà authentifié, propriété du tournoi vérifiée par getOwnedTournament dans
 * generateRefereeAccess) et affiche le QR résultant. Aucun secret ne transite avant ce clic —
 * contrairement à l'ancien QR arbitre statique, affiché en permanence dès le chargement de la
 * page.
 */
export function RefereeAccessButton({ tournamentId, board }: { tournamentId: string; board: number }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ qrDataUrl?: string; expiresInMinutes?: number; error?: string } | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await generateRefereeAccess(tournamentId, String(board));
      setResult(res);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
      <p className="font-semibold text-brand-dark">Cible {board}</p>

      {result?.qrDataUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.qrDataUrl} alt={`QR Arbitre Cible ${board}`} width={140} height={140} />
          <p className="text-xs text-brand-text-secondary">Valable {result.expiresInMinutes} min, usage unique</p>
          <button
            type="button"
            disabled={isPending}
            onClick={handleClick}
            className="text-xs text-brand-text-secondary hover:text-brand-dark underline disabled:opacity-60"
          >
            Régénérer
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Génération…" : "Générer l'accès arbitre"}
        </button>
      )}

      {result?.error && <p className="text-xs text-danger-solid">{result.error}</p>}
    </div>
  );
}
