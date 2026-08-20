"use client";

import { useEffect, useState } from "react";
import { attemptBuildSkewRecovery, isBuildSkewError, hasAttemptedBuildSkewRecovery } from "@/lib/utils/buildSkewRecovery";

/**
 * DO-STABILIZATION-001 (Problème 3) — filet de sécurité racine (jamais présent avant cette
 * mission) : couvre toute erreur non rattrapée par les error.tsx de segment ((public)/
 * (dashboard)/pilotage), notamment une erreur survenant dans le layout racine lui-même. Sans ce
 * fichier, ce cas atterrissait sur l'écran technique par défaut de Next.js/React, sans aucun log
 * ni tentative de récupération — remplace ce global-error absent (voir le rapport de mission).
 *
 * Doit rendre ses propres balises <html>/<body> (convention Next.js) : il remplace tout le
 * layout racine quand il se déclenche, celui-ci ayant potentiellement lui-même échoué.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recovering] = useState(() => isBuildSkewError(error) && !hasAttemptedBuildSkewRecovery());

  useEffect(() => {
    console.error("[error-boundary/global]", error);
    attemptBuildSkewRecovery(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        {recovering ? (
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p>Mise à jour disponible — actualisation…</p>
          </div>
        ) : (
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem", textAlign: "center", padding: "2rem" }}>
            <p style={{ fontWeight: 600 }}>Une erreur inattendue s&apos;est produite.</p>
            <p style={{ fontSize: "0.875rem", color: "#666" }}>Merci de réessayer dans quelques instants.</p>
            <button
              onClick={reset}
              style={{ borderRadius: "0.5rem", border: "1px solid #ccc", padding: "0.5rem 1rem", fontSize: "0.875rem", cursor: "pointer" }}
            >
              Réessayer
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
