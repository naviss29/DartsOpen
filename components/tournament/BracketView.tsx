import { Fragment } from "react";
import { roundLabel } from "@/lib/utils/bracket";
import { CARD_H, CARD_W, CONN_W, BASE_SLOT, deriveR1Slots, expectedCount, slotHasCard } from "@/lib/utils/bracketLayout";
import { ArbitrateMatchButton } from "./ArbitrateMatchModal";

interface BracketMatch {
  id: string;
  bracket_round: number;
  bracket_position: number;
  status: string;
  player1: { id: string; player_name: string } | null;
  player2: { id: string; player_name: string } | null;
  winner_id: string | null;
  sets?: { id: string; round_order: number; winner_id: string | null }[];
}

interface Props {
  matches: BracketMatch[];
  maxRound: number;
  tournamentId?: string;
}

export function BracketView({ matches, maxRound, tournamentId }: Props) {
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
              className="text-xs font-semibold text-brand-text-secondary uppercase tracking-widest text-center"
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
                        const laterMatchesCount = matches.filter((m) => m.bracket_round > match.bracket_round).length;
                        return (
                          <div key={match.id} style={{ position: "absolute", top, left: 0, right: 0 }}>
                            <BracketCard match={match} tournamentId={tournamentId} laterMatchesCount={laterMatchesCount} />
                          </div>
                        );
                      })
                  : // R2+ : toutes les positions prévues (réel ou placeholder)
                    Array.from({ length: count }, (_, j) => {
                      const match = roundMap.get(j);
                      const top = j * slotH + (slotH - CARD_H) / 2;
                      const laterMatchesCount = match ? matches.filter((m) => m.bracket_round > match.bracket_round).length : 0;
                      return (
                        <div key={match?.id ?? `ph-${round}-${j}`} style={{ position: "absolute", top, left: 0, right: 0 }}>
                          {match ? <BracketCard match={match} tournamentId={tournamentId} laterMatchesCount={laterMatchesCount} /> : <PlaceholderCard />}
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden opacity-60">
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-brand-text-secondary">?</span>
      </div>
      <div className="border-t border-slate-200" />
      <div className="px-3 flex items-center gap-2" style={{ height: 36 }}>
        <span className="text-sm text-brand-text-secondary">?</span>
      </div>
    </div>
  );
}

function BracketCard({ match, tournamentId, laterMatchesCount = 0 }: { match: BracketMatch; tournamentId?: string; laterMatchesCount?: number }) {
  const isBye = match.player2 === null;
  if (isBye) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-xs text-brand-text-secondary mb-0.5">BYE</p>
        <p className="text-sm font-semibold text-brand-text-secondary">{match.player1?.player_name}</p>
      </div>
    );
  }

  const hasResult = match.winner_id !== null;
  const accentBorder = match.status === "IN_PROGRESS" ? "border-l-brand-turquoise" : "border-l-transparent";

  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden border-l-4 ${accentBorder}`}>
      <PlayerRow
        name={match.player1?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player1?.id}
        isLoser={hasResult && match.winner_id !== match.player1?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
      <div className="border-t border-slate-100" />
      <PlayerRow
        name={match.player2?.player_name ?? "?"}
        isWinner={hasResult && match.winner_id === match.player2?.id}
        isLoser={hasResult && match.winner_id !== match.player2?.id}
        inProgress={match.status === "IN_PROGRESS"}
      />
      {tournamentId && match.player1 && match.player2 && match.sets && match.sets.length > 0 && (
        <div className="border-t border-slate-100 px-2 py-1 flex justify-end">
          <ArbitrateMatchButton
            match={{ ...match, player1: match.player1, player2: match.player2, sets: match.sets }}
            tournamentId={tournamentId}
            laterMatchesCount={laterMatchesCount}
          />
        </div>
      )}
    </div>
  );
}

function PlayerRow({ name, isWinner, isLoser, inProgress }: {
  name: string; isWinner: boolean; isLoser: boolean; inProgress: boolean;
}) {
  return (
    <div className={`px-3 flex items-center justify-between gap-2 ${isWinner ? "bg-emerald-50" : ""}`} style={{ height: 36 }}>
      <span className={`text-sm truncate ${isWinner ? "text-emerald-800 font-semibold" : isLoser ? "text-brand-text-secondary" : inProgress ? "text-brand-dark font-medium" : "text-brand-dark"}`}>
        {name}
      </span>
      {isWinner && <span className="flex-shrink-0 text-xs font-bold text-emerald-600">✓</span>}
      {inProgress && !isWinner && !isLoser && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-turquoise animate-pulse" />}
    </div>
  );
}
