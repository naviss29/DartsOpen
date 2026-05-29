"use client";

import { useEffect, useState } from "react";
import { QuickBracketView } from "./QuickBracketView";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

interface QuickMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  bracket_type: string;
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

async function fetchQuickMatches(tournamentId: string): Promise<QuickMatch[]> {
  const res = await fetch(`/api/public/tournaments/${tournamentId}/matches`);
  if (!res.ok) return [];
  const all = await res.json() as (QuickMatch & { pool_id: string | null })[];
  return all
    .filter((m) => m.pool_id === null && m.bracket_round !== null && m.bracket_type !== "SINGLE")
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Bracket double élimination
      </h2>
      <div className="rounded-xl bg-gray-900 border border-gray-700 p-4">
        <QuickBracketView matches={matches} />
      </div>
    </div>
  );
}
