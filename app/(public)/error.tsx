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
export default function PublicError({ error, reset }: { error: Error; reset: () => void }) {
  const [recovering] = useState(() => isBuildSkewError(error) && !hasAttemptedBuildSkewRecovery());

  useEffect(() => {
    console.error("[error-boundary/public]", error);
    attemptBuildSkewRecovery(error);
  }, [error]);

  if (recovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-light px-4">
        <p className="text-brand-dark font-medium">Mise à jour disponible — actualisation…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light px-4">
      <div className="text-center space-y-4">
        <p className="text-warning font-medium">Une erreur inattendue s&apos;est produite.</p>
        <p className="text-sm text-brand-text-secondary">Merci de réessayer dans quelques instants.</p>
        <button
          onClick={reset}
          className="rounded-lg border border-border-default px-4 py-2 text-sm text-brand-dark hover:bg-surface-secondary transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
