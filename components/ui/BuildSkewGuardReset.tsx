"use client";

import { useEffect } from "react";
import { clearBuildSkewRecoveryGuard } from "@/lib/utils/buildSkewRecovery";

/**
 * DO-STABILIZATION-001 (Problème 3) — tout chargement de page qui atteint ce point s'est fait
 * SANS erreur de rendu (sinon le error boundary du segment aurait pris le relais avant que le
 * layout racine ne monte normalement) : le build courant fonctionne. Efface le garde-fou anti-
 * boucle (lib/utils/buildSkewRecovery.ts) pour qu'un futur déploiement, plus tard dans la MÊME
 * session d'onglet, puisse à nouveau déclencher un rechargement automatique unique.
 */
export function BuildSkewGuardReset() {
  useEffect(() => {
    clearBuildSkewRecoveryGuard();
  }, []);
  return null;
}
