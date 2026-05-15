"use client";

import { useEffect, useState } from "react";
import { NextMatchAlert } from "./NextMatchAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ORG_SLUG = process.env.NEXT_PUBLIC_STER_ORG_SLUG ?? "dartsopen";

interface Player { id: string; player_name: string }
interface MatchSet { id: string; round_order: number; winner_id: string | null; validated_p1: boolean; validated_p2: boolean }
interface Match {
  id: string;
  board_number: number;
  status: string;
  player1: Player;
  player2: Player;
  sets: MatchSet[];
}

interface Props {
  tournamentId: string;
  initialMatches: Match[];
  nbBoards: number;
}

async function fetchActiveMatches(tournamentId: string): Promise<Match[]> {
  const res = await fetch(`${API_URL}/api/public/tournaments/${tournamentId}/matches`, {
    headers: { "X-Organization-Slug": ORG_SLUG },
  });
  if (!res.ok) return [];
  const all = await res.json() as Match[];
  return all.filter((m) => ["IN_PROGRESS", "PENDING"].includes(m.status));
}

export function MatchBoard({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [nextMatchAlert, setNextMatchAlert] = useState<{ boardNumber: number; match: Match } | null>(null);

  useEffect(() => {
    const poll = setInterval(async () => {
      const next = await fetchActiveMatches(tournamentId);
      setMatches((prev) => {
        // Detect when an IN_PROGRESS match disappears → show next PENDING alert
        for (const prevMatch of prev.filter((m) => m.status === "IN_PROGRESS")) {
          if (!next.find((m) => m.id === prevMatch.id)) {
            const nextPending = next.find(
              (m) => m.status === "PENDING" && m.board_number === prevMatch.board_number
            );
            if (nextPending) {
              setNextMatchAlert({ boardNumber: prevMatch.board_number, match: nextPending });
              setTimeout(() => setNextMatchAlert(null), 12000);
            }
          }
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(poll);
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inProgress = matches.filter((m) => m.status === "IN_PROGRESS");
  const pending = matches.filter((m) => m.status === "PENDING");

  return (
    <div className="space-y-6">
      {nextMatchAlert && (
        <NextMatchAlert
          boardNumber={nextMatchAlert.boardNumber}
          match={nextMatchAlert.match}
        />
      )}

      {inProgress.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            En cours ({inProgress.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {inProgress.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            À venir ({pending.length})
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {pending.map((m, i) => (
              <MatchCard key={m.id} match={m} compact index={i} />
            ))}
          </div>
        </div>
      )}

      {inProgress.length === 0 && pending.length === 0 && (
        <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-8 text-center text-gray-400">
          Tous les matchs sont terminés.
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, compact = false, index }: { match: Match; compact?: boolean; index?: number }) {
  const setsPlayed = match.sets.filter((s) => s.winner_id).length;
  const totalSets = match.sets.length;

  return (
    <div className={`rounded-xl bg-gray-800 border border-gray-700 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
      <div className="flex items-center justify-between mb-2">
        {compact ? (
          <span className="text-xs text-gray-500">#{(index ?? 0) + 1}</span>
        ) : (
          <span className="text-xs font-medium text-green-400">🎯 Cible {match.board_number}</span>
        )}
        {!compact && totalSets > 0 && (
          <span className="text-xs text-gray-500">Manche {setsPlayed}/{totalSets}</span>
        )}
      </div>
      <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
        <span className="text-white">{match.player1.player_name}</span>
        <span className="text-gray-500 mx-2">vs</span>
        <span className="text-white">{match.player2.player_name}</span>
      </div>
    </div>
  );
}
