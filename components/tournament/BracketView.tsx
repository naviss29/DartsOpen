import { Fragment } from "react";
import { roundLabel } from "@/lib/utils/bracket";

interface BracketMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  status: string;
  player1: { id: string; player_name: string } | null;
  player2: { id: string; player_name: string } | null;
  winner_id: string | null;
}

interface Props {
  matches: BracketMatch[];
  maxRound: number;
}

const CARD_H = 72;
const CARD_W = 220;
const CONN_W = 48;
const BASE_SLOT = CARD_H + 32;

function deriveR1Slots(matches: BracketMatch[]): number {
  const maxR = Math.max(...matches.map((m) => m.bracket_round));
  for (let r = 1; r <= maxR; r++) {
    const rMatches = matches.filter((m) => m.bracket_round === r);
    if (rMatches.length === 0) continue;
    const maxPos = Math.max(...rMatches.map((m) => m.bracket_position));
    return (maxPos + 1) * Math.pow(2, r - 1);
  }
  return 0;
}

function expectedCount(r1Slots: number, round: number): number {
  return Math.round(r1Slots / Math.pow(2, round - 1));
}

// Un "slot" a une carte si : R1 → match DB réel, R2+ → toujours (réel ou placeholder)
function slotHasCard(round: number, pos: number, roundMap: Map<number, BracketMatch>, r1Slots: number): boolean {
  if (round === 1) return roundMap.has(pos);
  return pos < expectedCount(r1Slots, round);
}

export function BracketView({ matches, maxRound }: Props) {
  if (matches.length === 0) return null;

  const r1Slots = deriveR1Slots(matches);
  const totalRounds = r1Slots > 0 ? Math.round(Math.log2(r1Slots)) + 1 : maxRound;
  const totalH = r1Slots * BASE_SLOT;
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  const matchByRoundPos = new Map<number, Map<number, BracketMatch>>();
  for (const m of matches) {
    const rMap = matchByRoundPos.get(m.bracket_round) ?? new Map();
    rMap.set(m.bracket_position, m);
    matchByRoundPos.set(m.bracket_round, rMap);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex mb-4">
        {rounds.map((round, i) => (
          <Fragment key={round}>
            {i > 0 && <div style={{ width: CONN_W }} />}
            <div
              style={{ width: CARD_W }}
              className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center"
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
            ? (matchByRoundPos.get(1)?.size ?? 0) // R1 : seulement les matchs réels
            : expectedCount(r1Slots, round);      // R2+ : toutes les positions prévues

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
                        {h0 && <line x1={0} y1={py0} x2={mx} y2={py0} stroke="#d1d5db" strokeWidth={1.5} />}
                        {h0 && h1 && <line x1={mx} y1={py0} x2={mx} y2={py1} stroke="#d1d5db" strokeWidth={1.5} />}
                        {h1 && <line x1={0} y1={py1} x2={mx} y2={py1} stroke="#d1d5db" strokeWidth={1.5} />}
                        <line x1={mx} y1={cy} x2={CONN_W} y2={cy} stroke="#d1d5db" strokeWidth={1.5} />
                      </g>
                    );
                  })}
                </svg>
              )}

              <div style={{ width: CARD_W, height: totalH, position: "relative", flexShrink: 0 }}>
                {round === 1
                  ? // R1 : seulement les matchs réels (pas de placeholder pour les byes)
                    [...roundMap.values()]
                      .sort((a, b) => a.bracket_position - b.bracket_position)
                      .map((match) => {
                        const top = match.bracket_position * slotH + (slotH - CARD_H) / 2;
                        return (
                          <div key={match.id} style={{ position: "absolute", top, left: 0, right: 0 }}>
                            <BracketCard match={match} />
                          </div>
                        );
                      })
                  : // R2+ : toutes les positions prévues (réel ou placeholder)
                    Array.from({ length: count }, (_, j) => {
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
  );
}

function PlaceholderCard() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 overflow-hidden opacity-60">
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-gray-400">?</span>
      </div>
      <div className="border-t border-gray-200" />
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-gray-400">?</span>
      </div>
    </div>
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isBye = match.player2 === null;
  if (isBye) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-xs text-gray-400 mb-0.5">BYE</p>
        <p className="text-sm font-semibold text-gray-600">{match.player1?.player_name}</p>
      </div>
    );
  }

  const hasResult = match.winner_id !== null;
  const accentBorder = match.status === "IN_PROGRESS" ? "border-l-green-500" : "border-l-transparent";

  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden border-l-4 ${accentBorder}`}>
      <PlayerRow
        name={match.player1?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player1?.id}
        isLoser={hasResult && match.winner_id !== match.player1?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
      <div className="border-t border-gray-100" />
      <PlayerRow
        name={match.player2?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player2?.id}
        isLoser={hasResult && match.winner_id !== match.player2?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
    </div>
  );
}

function PlayerRow({ name, isWinner, isLoser, inProgress }: {
  name: string; isWinner: boolean; isLoser: boolean; inProgress: boolean;
}) {
  return (
    <div className={`px-3 flex items-center justify-between gap-2 ${isWinner ? "bg-green-50" : ""}`} style={{ height: 36 }}>
      <span className={`text-sm truncate ${isWinner ? "text-green-700 font-semibold" : isLoser ? "text-gray-400" : inProgress ? "text-gray-800 font-medium" : "text-gray-700"}`}>
        {name}
      </span>
      {isWinner && <span className="flex-shrink-0 text-xs font-bold text-green-500">✓</span>}
      {inProgress && !isWinner && !isLoser && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
    </div>
  );
}
