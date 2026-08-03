"use client";

import { Fragment, useEffect, useState } from "react";
import { roundLabel } from "@/lib/utils/bracket";
import { CARD_H, CARD_W, CONN_W, BASE_SLOT, deriveR1Slots, expectedCount, slotHasCard } from "@/lib/utils/bracketLayout";

const MERCURE_URL = process.env.NEXT_PUBLIC_MERCURE_PUBLIC_URL ?? "";

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

async function fetchBracketMatches(tournamentId: string): Promise<BracketMatch[]> {
  const res = await fetch(`/api/public/tournaments/${tournamentId}/matches`);
  if (!res.ok) return [];
  const all = await res.json() as BracketMatch[];
  return all.filter((m) => m.bracket_round !== null);
}

export function BracketLive({ tournamentId, initialMatches }: Props) {
  const [matches, setMatches] = useState<BracketMatch[]>(initialMatches);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const doFetch = async () => {
      const next = await fetchBracketMatches(tournamentId);
      if (mounted && next.length > 0) setMatches(next);
    };

    const startPolling = () => {
      poll = setInterval(doFetch, 5000);
    };

    const connect = async () => {
      if (!MERCURE_URL) { startPolling(); return; }

      const tokenRes = await fetch(
        `/api/public/tournaments/${tournamentId}/mercure-token`
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

  if (matches.length === 0) return null;

  const r1Slots = deriveR1Slots(matches);
  const maxRound = Math.max(...matches.map((m) => m.bracket_round));
  const totalRounds = r1Slots > 0 ? Math.round(Math.log2(r1Slots)) + 1 : maxRound;
  const totalH = r1Slots * BASE_SLOT;
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  const matchByRoundPos = new Map<number, Map<number, BracketMatch>>();
  for (const m of matches) {
    const roundMap = matchByRoundPos.get(m.bracket_round) ?? new Map();
    roundMap.set(m.bracket_position, m);
    matchByRoundPos.set(m.bracket_round, roundMap);
  }

  const finalRoundMatches = matches.filter((m) => m.bracket_round === maxRound);
  const finalMatch = finalRoundMatches.length === 1 ? finalRoundMatches[0] : undefined;
  const winner =
    finalMatch?.status === "FINISHED" && finalMatch.winner_id
      ? finalMatch.winner_id === finalMatch.player1?.id
        ? finalMatch.player1?.player_name
        : finalMatch.player2?.player_name
      : null;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-darts-text-secondary">
        Phases finales
      </h2>

      {winner && (
        <div className="rounded-xl bg-darts-gold/10 border border-darts-gold/30 p-5 text-center space-y-1">
          <p className="text-2xl">🏆</p>
          <p className="text-sm text-darts-gold font-semibold">Vainqueur</p>
          <p className="text-xl font-bold text-darts-gold">{winner}</p>
        </div>
      )}

      <div className="bg-darts-surface rounded-xl border border-darts-border p-5 overflow-x-auto">
        <div className="pb-2">
          <div className="flex mb-4">
            {rounds.map((round, i) => (
              <Fragment key={round}>
                {i > 0 && <div style={{ width: CONN_W }} />}
                <div
                  style={{ width: CARD_W }}
                  className="text-xs font-semibold text-darts-text-secondary uppercase tracking-widest text-center"
                >
                  {roundLabel(round, totalRounds)}
                </div>
              </Fragment>
            ))}
          </div>

          <div className="flex items-start">
            {rounds.map((round, roundIdx) => {
              const roundMap = matchByRoundPos.get(round) ?? new Map();
              const slotH = BASE_SLOT * Math.pow(2, round - 1);
              const prevSlotH = slotH / 2;
              const prevRoundMap = matchByRoundPos.get(round - 1) ?? new Map();
              const count = round === 1
                ? (matchByRoundPos.get(1)?.size ?? 0)
                : expectedCount(r1Slots, round);

              return (
                <Fragment key={round}>
                  {roundIdx > 0 && (
                    <svg width={CONN_W} height={totalH} style={{ flexShrink: 0 }} aria-hidden="true">
                      {Array.from({ length: count }, (_, j) => {
                        const pos = round === 1
                          ? [...(matchByRoundPos.get(1)?.keys() ?? [])].sort((a, b) => a - b)[j]
                          : j;
                        const cy  = pos * slotH + slotH / 2;
                        const py0 = (2 * pos) * prevSlotH + prevSlotH / 2;
                        const py1 = (2 * pos + 1) * prevSlotH + prevSlotH / 2;
                        const mx  = CONN_W / 2;
                        const h0 = slotHasCard(round - 1, 2 * pos, prevRoundMap, r1Slots);
                        const h1 = slotHasCard(round - 1, 2 * pos + 1, prevRoundMap, r1Slots);
                        if (!h0 && !h1) return null;
                        return (
                          <g key={j}>
                            {h0 && <line x1={0} y1={py0} x2={mx} y2={py0} stroke="var(--color-darts-border)" strokeWidth={1.5} />}
                            {h0 && h1 && <line x1={mx} y1={py0} x2={mx} y2={py1} stroke="var(--color-darts-border)" strokeWidth={1.5} />}
                            {h1 && <line x1={0} y1={py1} x2={mx} y2={py1} stroke="var(--color-darts-border)" strokeWidth={1.5} />}
                            <line x1={mx} y1={cy} x2={CONN_W} y2={cy} stroke="var(--color-darts-border)" strokeWidth={1.5} />
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  <div style={{ width: CARD_W, height: totalH, position: "relative", flexShrink: 0 }}>
                    {round === 1
                      ? [...roundMap.values()]
                          .sort((a, b) => a.bracket_position - b.bracket_position)
                          .map((match) => {
                            const top = match.bracket_position * slotH + (slotH - CARD_H) / 2;
                            return (
                              <div key={match.id} style={{ position: "absolute", top, left: 0, right: 0 }}>
                                <BracketCard match={match} />
                              </div>
                            );
                          })
                      : Array.from({ length: count }, (_, j) => {
                          const match = roundMap.get(j);
                          const top = j * slotH + (slotH - CARD_H) / 2;
                          return (
                            <div key={match?.id ?? `ph-${round}-${j}`} style={{ position: "absolute", top, left: 0, right: 0 }}>
                              {match ? <BracketCard match={match} /> : <PlaceholderCard />}
                            </div>
                          );
                        })
                    }
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

function PlaceholderCard() {
  return (
    <div className="rounded-lg border border-dashed border-darts-border bg-darts-surface-raised/50 overflow-hidden opacity-50">
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-darts-text-secondary">?</span>
      </div>
      <div className="border-t border-darts-border" />
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-darts-text-secondary">?</span>
      </div>
    </div>
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isBye = match.player2 === null;

  if (isBye) {
    return (
      <div className="rounded-lg border border-dashed border-darts-border bg-darts-surface-raised/60 px-3 py-2.5">
        <p className="text-xs text-darts-text-secondary mb-0.5">BYE</p>
        <p className="text-sm font-semibold text-darts-text">{match.player1?.player_name}</p>
      </div>
    );
  }

  const hasResult = match.winner_id !== null;
  const accentBorder = match.status === "IN_PROGRESS" ? "border-l-darts-green" : "border-l-transparent";

  return (
    <div className={`rounded-lg border border-darts-border bg-darts-surface-raised overflow-hidden border-l-4 ${accentBorder}`}>
      <PlayerRow
        name={match.player1?.player_name ?? "En attente"}
        isWinner={hasResult && match.winner_id === match.player1?.id}
        isLoser={hasResult && match.winner_id !== match.player1?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
      <div className="border-t border-darts-border" />
      <PlayerRow
        name={match.player2?.player_name ?? "En attente"}
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
      className={`px-3 flex items-center justify-between gap-2 ${isWinner ? "bg-darts-green/10" : ""}`}
      style={{ height: 36 }}
    >
      <span
        className={`text-sm truncate ${
          isWinner
            ? "text-darts-green font-semibold"
            : isLoser
            ? "text-darts-text-secondary"
            : inProgress
            ? "text-darts-text font-medium"
            : "text-darts-text"
        }`}
      >
        {name}
      </span>
      {isWinner && <span className="flex-shrink-0 text-xs font-bold text-darts-green">✓</span>}
      {inProgress && !isWinner && !isLoser && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-darts-green animate-pulse" />
      )}
    </div>
  );
}
