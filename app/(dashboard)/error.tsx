"use client";

import { useEffect, useState } from "react";
import { attemptBuildSkewRecovery, isBuildSkewError, hasAttemptedBuildSkewRecovery } from "@/lib/utils/buildSkewRecovery";

// Convention du dépôt (voir CLAUDE.md §Gestion des erreurs) : jamais d'erreur avalée sans
// log. S'appliquait déjà aux .catch() de requêtes DB, manquait ici pour les erreurs de rendu.
//
// DO-STABILIZATION-001 (Problème 3) — une erreur "Server Action introuvable" après déploiement
// (ancien JS encore en mémoire, voir lib/utils/buildSkewRecovery.ts) ne doit jamais rester
// affichée telle quelle : un rechargement sûr, borné à une seule tentative, est déclenché
// silencieusement. Toute autre erreur applicative garde exactement le comportement existant.
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  // Décision purement dérivée de l'erreur reçue, calculée une seule fois au montage (jamais mise
  // à jour par l'effect ci-dessous — react-hooks/set-state-in-effect) : reflète fidèlement si une
  // tentative de récupération va réellement être déclenchée par cet effect.
  const [recovering] = useState(() => isBuildSkewError(error) && !hasAttemptedBuildSkewRecovery());

  useEffect(() => {
    console.error("[error-boundary/dashboard]", error);
    attemptBuildSkewRecovery(error);
  }, [error]);

  if (recovering) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center space-y-2">
        <p className="text-brand-dark font-medium">Mise à jour disponible — actualisation…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center space-y-4">
      <p className="text-red-700 font-medium">Une erreur est survenue.</p>
      {error?.message && (
        <p className="text-sm text-red-600 font-mono">{error.message}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-100 transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
