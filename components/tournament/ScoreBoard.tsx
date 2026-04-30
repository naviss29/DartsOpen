"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computePoolStandings } from "@/lib/utils/pools";

interface PoolPlayer {
  registration_id: string;
  registrations: { player_name: string };
}

interface Pool {
  id: string;
  name: string;
  pool_players: PoolPlayer[];
}

interface FinishedMatch {
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  pool_id: string | null;
}

interface Props {
  tournamentId: string;
  pools: Pool[];
  finishedMatches: FinishedMatch[];
}

export function ScoreBoard({ tournamentId, pools, finishedMatches: initialMatches }: Props) {
  const [finishedMatches, setFinishedMatches] = useState(initialMatches);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`scoreboard-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          supabase
            .from("matches")
            .select("player1_id, player2_id, winner_id, pool_id")
            .eq("tournament_id", tournamentId)
            .eq("status", "FINISHED")
            .then(({ data }) => { if (data) setFinishedMatches(data); });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
            pool.pool_players.map((pp) => {
              const wins = poolMatches.filter((m) => m.winner_id === pp.registration_id).length;
              const losses = poolMatches.filter(
                (m) =>
                  (m.player1_id === pp.registration_id || m.player2_id === pp.registration_id) &&
                  m.winner_id !== null &&
                  m.winner_id !== pp.registration_id
              ).length;
              return {
                registration_id: pp.registration_id,
                player_name: pp.registrations.player_name,
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
