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

// Messages `fetch()` natifs quand la requête n'atteint même pas le serveur (hors ligne, DNS,
// coupure réseau) — jamais un message applicatif, toujours celui du navigateur, donc jamais
// traduit. Un organisateur en pleine soirée n'a pas à lire "Failed to fetch" en anglais.
const NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
  /Failed to fetch/i,        // Chrome / Edge
  /NetworkError when attempting to fetch/i, // Firefox
  /Load failed/i,            // Safari
];

function isNetworkError(error: Error): boolean {
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

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
      <div className="rounded-xl border border-border-muted bg-surface-secondary p-8 text-center space-y-2">
        <p className="text-brand-dark font-medium">Mise à jour disponible — actualisation…</p>
      </div>
    );
  }

  const network = isNetworkError(error);

  return (
    <div className="rounded-xl border border-danger-border bg-danger-subtle p-8 text-center space-y-4">
      <p className="text-danger font-medium">
        {network ? "Connexion impossible." : "Une erreur est survenue."}
      </p>
      {network ? (
        <p className="text-sm text-danger-solid">Vérifiez votre connexion internet, puis réessayez.</p>
      ) : (
        error?.message && <p className="text-sm text-danger-solid font-mono">{error.message}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg border border-danger-border px-4 py-2 text-sm text-danger hover:bg-danger-subtle transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
