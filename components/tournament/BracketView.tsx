import { Fragment } from "react";
import { roundLabel, computeTotalRounds } from "@/lib/utils/bracket";

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

const CARD_H = 72; // px — height of a match card (2 player rows of 36px)
const CARD_W = 220; // px — width of a match card
const CONN_W = 48;  // px — width of SVG connector column between rounds
const BASE_SLOT = CARD_H + 32; // px — slot height in round 1 (card + breathing room)

export function BracketView({ matches, maxRound }: Props) {
  const r1Count = matches.filter((m) => m.bracket_round === 1).length;
  const totalRounds = computeTotalRounds(r1Count, maxRound);
  const totalH = r1Count * BASE_SLOT;
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto pb-2">
      {/* Round labels */}
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
              {/* SVG connector between rounds */}
              {roundIdx > 0 && (
                <svg
                  width={CONN_W}
                  height={totalH}
                  style={{ flexShrink: 0 }}
                  aria-hidden="true"
                >
                  {roundMatches.map((_, idx) => {
                    const cy  = idx * slotH + slotH / 2;
                    const py0 = (2 * idx) * prevSlotH + prevSlotH / 2;
                    const py1 = (2 * idx + 1) * prevSlotH + prevSlotH / 2;
                    const mx  = CONN_W / 2;
                    return (
                      <g key={idx}>
                        {/* horizontal from prev match 0 */}
                        <line x1={0} y1={py0} x2={mx} y2={py0} stroke="#d1d5db" strokeWidth={1.5} />
                        {/* vertical joining the two prev matches */}
                        <line x1={mx} y1={py0} x2={mx} y2={py1} stroke="#d1d5db" strokeWidth={1.5} />
                        {/* horizontal from prev match 1 */}
                        <line x1={0} y1={py1} x2={mx} y2={py1} stroke="#d1d5db" strokeWidth={1.5} />
                        {/* horizontal to current match */}
                        <line x1={mx} y1={cy} x2={CONN_W} y2={cy} stroke="#d1d5db" strokeWidth={1.5} />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Match column */}
              <div
                style={{ width: CARD_W, height: totalH, position: "relative", flexShrink: 0 }}
              >
                {roundMatches.map((match, idx) => {
                  const top = idx * slotH + (slotH - CARD_H) / 2;
                  return (
                    <div
                      key={match.id}
                      style={{ position: "absolute", top, left: 0, right: 0 }}
                    >
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
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isBye = match.player1?.id === match.player2?.id;

  if (isBye) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-xs text-gray-400 mb-0.5">BYE</p>
        <p className="text-sm font-semibold text-gray-600">{match.player1?.player_name}</p>
      </div>
    );
  }

  const hasResult = match.winner_id !== null;
  const accentBorder =
    match.status === "IN_PROGRESS"
      ? "border-l-green-500"
      : "border-l-transparent";

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
      className={`px-3 flex items-center justify-between gap-2 ${
        isWinner ? "bg-green-50" : ""
      }`}
      style={{ height: 36 }}
    >
      <span
        className={`text-sm truncate ${
          isWinner
            ? "text-green-700 font-semibold"
            : isLoser
            ? "text-gray-400"
            : inProgress
            ? "text-gray-800 font-medium"
            : "text-gray-700"
        }`}
      >
        {name}
      </span>
      {isWinner && (
        <span className="flex-shrink-0 text-xs font-bold text-green-500">✓</span>
      )}
      {inProgress && !isWinner && !isLoser && (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      )}
    </div>
  );
}
