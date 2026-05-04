"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface BracketMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  status: string;
  winner_id: string | null;
  player1: { id: string; player_name: string } | null;
  player2: { id: string; player_name: string } | null;
}

interface Props {
  tournamentId: string;
  initialMatches: BracketMatch[];
}

function roundLabel(round: number, maxRound: number): string {
  const fromEnd = maxRound - round;
  if (fromEnd === 0) return "Finale";
  if (fromEnd === 1) return "Demi-finales";
  if (fromEnd === 2) return "Quarts de finale";
  if (fromEnd === 3) return "Huitièmes";
  return `Tour ${round}`;
}

export function BracketLive({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<BracketMatch[]>(initialMatches);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`bracket-live-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` },
        () => {
          supabase
            .from("matches")
            .select(`
              id, bracket_round, bracket_position, status, winner_id,
              player1:registrations!matches_player1_id_fkey(id, player_name),
              player2:registrations!matches_player2_id_fkey(id, player_name)
            `)
            .eq("tournament_id", tournamentId)
            .is("pool_id", null)
            .order("bracket_round")
            .order("bracket_position")
            .then(({ data }) => {
              if (data) {
                const normalized = data.map((m) => ({
                  ...m,
                  player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
                  player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
                })) as BracketMatch[];
                setMatches(normalized);
              }
            });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId]);

  if (matches.length === 0) return null;

  const maxRound = Math.max(...matches.map((m) => m.bracket_round));
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const winner = (() => {
    const final = matches.find((m) => m.bracket_round === maxRound);
    if (final?.status === "FINISHED" && final.winner_id) {
      return final.winner_id === final.player1?.id
        ? final.player1?.player_name
        : final.player2?.player_name;
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Phases finales
      </h2>

      {winner && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-5 text-center space-y-1">
          <p className="text-2xl">🏆</p>
          <p className="text-sm text-yellow-400 font-semibold">Vainqueur</p>
          <p className="text-xl font-bold text-yellow-300">{winner}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 overflow-x-auto">
        <div className="flex gap-6 min-w-max">
          {rounds.map((round) => {
            const roundMatches = matches
              .filter((m) => m.bracket_round === round)
              .sort((a, b) => a.bracket_position - b.bracket_position);

            return (
              <div key={round} className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider text-center px-2">
                  {roundLabel(round, maxRound)}
                </p>
                <div
                  className="flex flex-col gap-3"
                  style={{ justifyContent: roundMatches.length === 1 ? "center" : "space-around" }}
                >
                  {roundMatches.map((match) => (
                    <BracketCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isBye = match.player1?.id === match.player2?.id;

  if (isBye) {
    return (
      <div className="w-52 rounded-lg border border-dashed border-gray-600 bg-gray-700/40 p-3 text-center">
        <p className="text-xs text-gray-500">BYE</p>
        <p className="text-sm font-medium text-gray-300 mt-1">{match.player1?.player_name}</p>
      </div>
    );
  }

  const borderColor = {
    IN_PROGRESS: "border-green-500/50 bg-green-500/5",
    FINISHED: "border-gray-600 bg-gray-700/30",
    PENDING: "border-gray-700 bg-gray-800/50",
  }[match.status] ?? "border-gray-700 bg-gray-800/50";

  return (
    <div className={`w-52 rounded-lg border p-3 space-y-2 ${borderColor}`}>
      <PlayerRow
        name={match.player1?.player_name ?? "?"}
        isWinner={match.winner_id === match.player1?.id}
        isFinished={match.status === "FINISHED"}
      />
      <div className="border-t border-gray-700" />
      <PlayerRow
        name={match.player2?.player_name ?? "?"}
        isWinner={match.winner_id === match.player2?.id}
        isFinished={match.status === "FINISHED"}
      />
      {match.status === "IN_PROGRESS" && (
        <p className="text-center text-xs text-green-400 font-medium animate-pulse">EN COURS</p>
      )}
    </div>
  );
}

function PlayerRow({ name, isWinner, isFinished }: { name: string; isWinner: boolean; isFinished: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${
      isWinner ? "text-green-400 font-semibold" : isFinished ? "text-gray-500" : "text-gray-200"
    }`}>
      {isWinner && <span className="text-green-400 text-xs">✓</span>}
      <span className="truncate">{name}</span>
    </div>
  );
}
