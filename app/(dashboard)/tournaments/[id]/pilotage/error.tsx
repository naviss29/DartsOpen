"use client";

import { useEffect, useState } from "react";
import { attemptBuildSkewRecovery, isBuildSkewError, hasAttemptedBuildSkewRecovery } from "@/lib/utils/buildSkewRecovery";

/**
 * DO-OPS-001 (mission §16) — état d'erreur propre pour la console jour J : convention Next.js
 * standard (error.tsx de segment), jamais une page blanche ou un crash silencieux.
 *
 * DO-STABILIZATION-001 (Problème 3) — même détection de build skew que les autres error.tsx
 * (voir lib/utils/buildSkewRecovery.ts) : un jour J, un onglet Pilotage resté ouvert pendant un
 * déploiement ne doit jamais rester bloqué sur "Server Action introuvable" en pleine conduite
 * de tournoi.
 */
export default function PilotageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recovering] = useState(() => isBuildSkewError(error) && !hasAttemptedBuildSkewRecovery());

  useEffect(() => {
    attemptBuildSkewRecovery(error);
  }, [error]);

  if (recovering) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-2">
        <p className="font-medium text-brand-dark">Mise à jour disponible — actualisation…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
      <p className="text-3xl" aria-hidden>⚠️</p>
      <p className="font-semibold text-red-700">La console n&apos;a pas pu s&apos;afficher.</p>
      <p className="text-sm text-red-700/80">Les données du tournoi sont temporairement indisponibles.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Réessayer
      </button>
    </div>
  );
}
