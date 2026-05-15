"use client";

import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { roundLabel, computeTotalRounds } from "@/lib/utils/bracket";

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

const CARD_H = 72;
const CARD_W = 220;
const CONN_W = 48;
const BASE_SLOT = CARD_H + 32;

export function BracketLive({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<BracketMatch[]>(initialMatches);

  useEffect(() => {
    const supabase = createClient();

    const fetchMatches = () =>
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
            setMatches(data.map((m) => ({
              ...m,
              player1: Array.isArray(m.player1) ? m.player1[0] : m.player1,
              player2: Array.isArray(m.player2) ? m.player2[0] : m.player2,
            })) as BracketMatch[]);
          }
        });

    // Realtime — mises à jour immédiates sur changement de match
    const channel = supabase
      .channel(`bracket-live-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` },
        () => fetchMatches()
      )
      .subscribe();

    // Polling 5s — filet de sécurité pour les nouveaux tours créés côté serveur
    const poll = setInterval(() => fetchMatches(), 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [tournamentId]);

  if (matches.length === 0) return null;

  const maxRound = Math.max(...matches.map((m) => m.bracket_round));
  const r1Count = matches.filter((m) => m.bracket_round === 1).length;
  const totalRounds = computeTotalRounds(r1Count, maxRound);
  const totalH = r1Count * BASE_SLOT;
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const finalMatch = matches.find((m) => m.bracket_round === maxRound);
  const winner =
    finalMatch?.status === "FINISHED" && finalMatch.winner_id
      ? finalMatch.winner_id === finalMatch.player1?.id
        ? finalMatch.player1?.player_name
        : finalMatch.player2?.player_name
      : null;

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
        <div className="pb-2">
          {/* Round labels */}
          <div className="flex mb-4">
            {rounds.map((round, i) => (
              <Fragment key={round}>
                {i > 0 && <div style={{ width: CONN_W }} />}
                <div
                  style={{ width: CARD_W }}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-widest text-center"
                >
                  {roundLabel(round, totalRounds)}
                </div>
              </Fragment>
            ))}
          </div>

          {/* Bracket body */}
          <div className="flex items-start">
            {rounds.map((round, roundIdx) => {
              const roundMatches = matches
                .filter((m) => m.bracket_round === round)
                .sort((a, b) => a.bracket_position - b.bracket_position);

              const slotH = BASE_SLOT * Math.pow(2, round - 1);
              const prevSlotH = slotH / 2;

              return (
                <Fragment key={round}>
                  {/* SVG connector */}
                  {roundIdx > 0 && (
                    <svg width={CONN_W} height={totalH} style={{ flexShrink: 0 }} aria-hidden="true">
                      {roundMatches.map((_, idx) => {
                        const cy  = idx * slotH + slotH / 2;
                        const py0 = (2 * idx) * prevSlotH + prevSlotH / 2;
                        const py1 = (2 * idx + 1) * prevSlotH + prevSlotH / 2;
                        const mx  = CONN_W / 2;
                        return (
                          <g key={idx}>
                            <line x1={0} y1={py0} x2={mx} y2={py0} stroke="#374151" strokeWidth={1.5} />
                            <line x1={mx} y1={py0} x2={mx} y2={py1} stroke="#374151" strokeWidth={1.5} />
                            <line x1={0} y1={py1} x2={mx} y2={py1} stroke="#374151" strokeWidth={1.5} />
                            <line x1={mx} y1={cy} x2={CONN_W} y2={cy} stroke="#374151" strokeWidth={1.5} />
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  {/* Match column */}
                  <div style={{ width: CARD_W, height: totalH, position: "relative", flexShrink: 0 }}>
                    {roundMatches.map((match, idx) => {
                      const top = idx * slotH + (slotH - CARD_H) / 2;
                      return (
                        <div key={match.id} style={{ position: "absolute", top, left: 0, right: 0 }}>
                          <BracketCard match={match} />
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isBye = match.player1?.id === match.player2?.id;

  if (isBye) {
    return (
      <div className="rounded-lg border border-dashed border-gray-600 bg-gray-700/40 px-3 py-2.5">
        <p className="text-xs text-gray-500 mb-0.5">BYE</p>
        <p className="text-sm font-semibold text-gray-300">{match.player1?.player_name}</p>
      </div>
    );
  }

  const hasResult = match.winner_id !== null;
  const accentBorder =
    match.status === "IN_PROGRESS" ? "border-l-green-500" : "border-l-transparent";

  return (
    <div className={`rounded-lg border border-gray-600 bg-gray-700 overflow-hidden border-l-4 ${accentBorder}`}>
      <PlayerRow
        name={match.player1?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player1?.id}
        isLoser={hasResult && match.winner_id !== match.player1?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
      <div className="border-t border-gray-600" />
      <PlayerRow
        name={match.player2?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player2?.id}
        isLoser={hasResult && match.winner_id !== match.player2?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
    </div>
  );
}

function PlayerRow({
  name,
  isWinner,
  isLoser,
  inProgress,
}: {
  name: string;
  isWinner: boolean;
  isLoser: boolean;
  inProgress: boolean;
}) {
  return (
    <div
      className={`px-3 flex items-center justify-between gap-2 ${isWinner ? "bg-green-500/10" : ""}`}
      style={{ height: 36 }}
    >
      <span
        className={`text-sm truncate ${
          isWinner
            ? "text-green-400 font-semibold"
            : isLoser
            ? "text-gray-500"
            : inProgress
            ? "text-gray-100 font-medium"
            : "text-gray-200"
        }`}
      >
        {name}
      </span>
      {isWinner && (
        <span className="flex-shrink-0 text-xs font-bold text-green-400">✓</span>
      )}
      {inProgress && !isWinner && !isLoser && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      )}
    </div>
  );
}
