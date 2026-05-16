"use client";

import { useEffect, useState } from "react";
import { computePoolStandings } from "@/lib/utils/pools";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ORG_SLUG = process.env.NEXT_PUBLIC_STER_ORG_SLUG ?? "dartsopen";
const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

interface Pool {
  id: string;
  name: string;
  players: { id: string; player_name: string }[];
}

interface FinishedMatch {
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  pool_id: string;
}

interface Props {
  tournamentId: string;
  pools: Pool[];
  finishedMatches: FinishedMatch[];
}

async function fetchFinishedPoolMatches(tournamentId: string): Promise<FinishedMatch[]> {
  const res = await fetch(`${API_URL}/api/public/tournaments/${tournamentId}/matches`, {
    headers: { "X-Organization-Slug": ORG_SLUG },
  });
  if (!res.ok) return [];
  const all = await res.json() as Array<{ player1_id: string; player2_id: string; winner_id: string | null; pool_id: string | null; status: string }>;
  return all
    .filter((m) => m.pool_id !== null && m.status === "FINISHED")
    .map((m) => ({ player1_id: m.player1_id, player2_id: m.player2_id, winner_id: m.winner_id, pool_id: m.pool_id as string }));
}

export function ScoreBoard({ tournamentId, pools, finishedMatches: initialMatches }: Props) {
  const [finishedMatches, setFinishedMatches] = useState(initialMatches);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const doFetch = async () => {
      const next = await fetchFinishedPoolMatches(tournamentId);
      if (mounted) setFinishedMatches(next);
    };

    const startPolling = () => {
      poll = setInterval(doFetch, 5000);
    };

    const connect = async () => {
      if (!MERCURE_URL) { startPolling(); return; }

      const tokenRes = await fetch(
        `${API_URL}/api/public/tournaments/${tournamentId}/mercure-token`,
        { headers: { "X-Organization-Slug": ORG_SLUG } }
      );
      if (!tokenRes.ok) { startPolling(); return; }

      const { token, topic } = await tokenRes.json() as { token: string; topic: string };
      const url = new URL(MERCURE_URL);
      url.searchParams.append("topic", topic);
      url.searchParams.append("authorization", token);

      es = new EventSource(url.toString());
      es.onmessage = doFetch;
      es.onerror = () => {
        es?.close();
        es = null;
        if (mounted && !poll) startPolling();
      };
    };

    connect();
    return () => {
      mounted = false;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [tournamentId]);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Classements par poule
      </h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pools.map((pool) => {
          const poolMatches = finishedMatches.filter((m) => m.pool_id === pool.id);

          const standings = computePoolStandings(
            pool.players.map((p) => {
              const wins = poolMatches.filter((m) => m.winner_id === p.id).length;
              const losses = poolMatches.filter(
                (m) =>
                  (m.player1_id === p.id || m.player2_id === p.id) &&
                  m.winner_id !== null &&
                  m.winner_id !== p.id
              ).length;
              return {
                registration_id: p.id,
                player_name: p.player_name,
                wins,
                losses,
                sets_won: wins,
                sets_lost: losses,
              };
            })
          );

          return (
            <div key={pool.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-700/50 border-b border-gray-700">
                <h3 className="font-semibold text-white text-sm">{pool.name}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Joueur</th>
                    <th className="px-3 py-2 text-center">V</th>
                    <th className="px-3 py-2 text-center">D</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {standings.map((s, i) => (
                    <tr key={s.registration_id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-white">{s.player_name}</td>
                      <td className="px-3 py-2.5 text-center text-green-400 font-medium">{s.wins}</td>
                      <td className="px-3 py-2.5 text-center text-red-400">{s.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
