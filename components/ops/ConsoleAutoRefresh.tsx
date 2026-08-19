"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

/**
 * DO-OPS-001 — actualisation de la console jour J : réutilise exactement le mécanisme déjà en
 * place pour les vues live/TV (jeton Mercure via `/api/public/tournaments/[id]/mercure-token`,
 * voir MatchBoard.tsx, avec repli sur un polling — jamais une nouvelle infrastructure temps
 * réel). Aucune donnée n'est recalculée côté client ici : chaque signal se contente d'appeler
 * `router.refresh()`, qui relance la Server Component de la console (mêmes fonctions `db*` déjà
 * utilisées partout ailleurs dans le dashboard) — la fraîcheur des données reste entièrement
 * portée par le serveur, jamais dupliquée en état client.
 */
export function ConsoleAutoRefresh({ tournamentId, intervalMs = 8000 }: { tournamentId: string; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      poll = setInterval(() => router.refresh(), intervalMs);
    };

    const connect = async () => {
      if (!MERCURE_URL) {
        startPolling();
        return;
      }
      try {
        const tokenRes = await fetch(`/api/public/tournaments/${tournamentId}/mercure-token`);
        // DO-OPS-002 — le composant peut avoir été démonté PENDANT ce fetch async (navigation,
        // changement d'onglet du dashboard) : sans cette vérification, le code qui suit
        // s'exécuterait quand même après le nettoyage de l'effet (qui n'a alors rien eu à fermer,
        // `es`/`poll` étant encore `null` à ce moment-là), créant un EventSource ou un timer
        // orphelin qu'aucun cleanup ne referme plus jamais.
        if (!mounted) return;
        if (!tokenRes.ok) {
          startPolling();
          return;
        }
        const { token, topic } = (await tokenRes.json()) as { token: string; topic: string };
        if (!mounted) return;
        const url = new URL(MERCURE_URL);
        url.searchParams.append("topic", topic);
        url.searchParams.append("authorization", token);
        es = new EventSource(url.toString());
        es.onmessage = () => router.refresh();
        es.onerror = () => {
          es?.close();
          es = null;
          if (mounted && !poll) startPolling();
        };
      } catch {
        if (mounted && !poll) startPolling();
      }
    };

    connect();
    return () => {
      mounted = false;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [tournamentId, intervalMs, router]);

  return null;
}
