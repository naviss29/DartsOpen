"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Une relecture toutes les 2 s, 15 fois au plus : ~30 s, le temps habituel d'un webhook Stripe. */
export const PAYMENT_REFRESH_INTERVAL_MS = 2000;
export const PAYMENT_REFRESH_MAX_ATTEMPTS = 15;

/**
 * Page de retour d'un paiement en ligne encore en attente du webhook : relance la Server Component
 * (`router.refresh()`, même mécanisme que ConsoleAutoRefresh) pour relire l'état réel en base,
 * jusqu'à ce que la page cesse de rendre ce composant (inscription confirmée, échouée…).
 *
 * Pourquoi borné : le webhook peut être retardé ou perdu (redélivraison SterPlatform plus tard) ;
 * interroger sans fin chargerait le serveur pour rien et laisserait le joueur devant un message
 * figé. Au-delà de la borne, on lui dit que l'e-mail de confirmation fera foi. Le compteur vit
 * dans l'état client, que `router.refresh()` conserve entre deux relectures.
 */
export function PaymentConfirmationRefresh({
  slowMessage,
  intervalMs = PAYMENT_REFRESH_INTERVAL_MS,
  maxAttempts = PAYMENT_REFRESH_MAX_ATTEMPTS,
}: {
  slowMessage: string;
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const exhausted = attempts >= maxAttempts;

  useEffect(() => {
    if (exhausted) return;
    const timer = setTimeout(() => {
      try {
        router.refresh();
      } catch (err) {
        // Une relecture ratée ne doit pas bloquer les suivantes : on compte quand même la tentative.
        console.error("[inscription] Relecture de l'état du paiement impossible :", err instanceof Error ? err.message : err);
      }
      setAttempts((n) => n + 1);
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [attempts, exhausted, intervalMs, router]);

  if (!exhausted) return null;
  return (
    <p role="status" className="text-brand-text-secondary text-sm">
      {slowMessage}
    </p>
  );
}
