"use client";

import { useEffect, useState } from "react";
import { QuickBracketView } from "./QuickBracketView";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

interface QuickMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  board_number: number;
  status: string;
  winner_id: string | null;
  player1: { id: string; player_name: string; lives: number } | null;
  player2: { id: string; player_name: string; lives: number } | null;
  sets: { id: string; round_order: number; winner_id: string | null }[];
}

interface Props {
  tournamentId: string;
  initialMatches: QuickMatch[];
}

/**
 * DO-QUICK-POOL-001 — plus de filtre sur bracket_type (les matchs de mode rapide utilisent
 * désormais SINGLE, comme le mode standard) : ce composant n'est monté que pour un tournoi déjà
 * connu comme quick mode par l'appelant (voir app/(public)/t/[id]/live/page.tsx), donc
 * `pool_id === null && bracket_round !== null` suffit à isoler ses matchs de bracket.
 */
async function fetchQuickMatches(tournamentId: string): Promise<QuickMatch[]> {
  const res = await fetch(`/api/public/tournaments/${tournamentId}/matches`);
  if (!res.ok) return [];
  const all = await res.json() as (QuickMatch & { pool_id: string | null })[];
  return all
    .filter((m) => m.pool_id === null && m.bracket_round !== null)
    .map(({ pool_id: _p, ...m }) => m);
}

export function QuickBracketLive({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<QuickMatch[]>(initialMatches);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const doFetch = async () => {
      const next = await fetchQuickMatches(tournamentId);
      if (mounted && next.length > 0) setMatches(next);
    };

    const startPolling = () => { poll = setInterval(doFetch, 5000); };

    const connect = async () => {
      if (!MERCURE_URL) { startPolling(); return; }

      const tokenRes = await fetch(
        `/api/public/tournaments/${tournamentId}/mercure-token`
      ).catch(() => null);
      if (!tokenRes?.ok) { startPolling(); return; }

      const { token, topic } = await tokenRes.json() as { token: string; topic: string };
      const url = new URL(MERCURE_URL);
      url.searchParams.append("topic", topic);
      url.searchParams.append("authorization", token);

      es = new EventSource(url.toString());
      es.onmessage = doFetch;
      es.onerror = () => { es?.close(); es = null; if (mounted && !poll) startPolling(); };
    };

    connect();
    return () => { mounted = false; es?.close(); if (poll) clearInterval(poll); };
  }, [tournamentId]);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Tournoi rapide — 2 vies
      </h2>
      <div className="rounded-xl bg-surface-secondary border border-border-default p-4">
        <QuickBracketView matches={matches} />
      </div>
    </div>
  );
}
