"use client";

import { useEffect } from "react";

// Convention du dépôt (voir CLAUDE.md §Gestion des erreurs) : jamais d'erreur avalée sans
// log. S'appliquait déjà aux .catch() de requêtes DB, manquait ici pour les erreurs de rendu.
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[error-boundary/dashboard]", error);
  }, [error]);

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
