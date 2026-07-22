"use client";

import { useState, useTransition } from "react";
import { arbitrateMatch } from "@/lib/actions/admin";

interface MatchSet {
  id: string;
  round_order: number;
  winner_id: string | null;
}

interface Player {
  id: string;
  player_name: string;
}

interface Props {
  match: {
    id: string;
    status: string;
    player1: Player;
    player2: Player;
    sets: MatchSet[];
  };
  tournamentId: string;
  /** Nombre de matchs déjà générés dans les tours suivants — 0 si aucun risque de suppression. */
  laterMatchesCount?: number;
}

export function ArbitrateMatchButton({ match, tournamentId, laterMatchesCount = 0 }: Props) {
  const [open, setOpen] = useState(false);

  if (!match.sets?.length) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-orange-500 hover:text-orange-700 transition-colors"
        title="Arbitrer ce match"
      >
        Arbitrer
      </button>
      {open && (
        <ArbitrateModal
          match={match}
          tournamentId={tournamentId}
          laterMatchesCount={laterMatchesCount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ArbitrateModal({ match, tournamentId, laterMatchesCount = 0, onClose }: Props & { onClose: () => void }) {
  const sortedSets = [...match.sets].sort((a, b) => a.round_order - b.round_order);
  const [winners, setWinners] = useState<Record<string, string | null>>(
    Object.fromEntries(sortedSets.map((s) => [s.id, s.winner_id]))
  );
  const [error, setError] = useState<string | null>(null);
  const [ackDestructive, setAckDestructive] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDestructive = laterMatchesCount > 0;

  const setWinner = (setId: string, winnerId: string | null) => {
    setWinners((w) => ({ ...w, [setId]: winnerId }));
    setAckDestructive(false);
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const setWinners = sortedSets.map((s) => ({ setId: s.id, winnerId: winners[s.id] ?? null }));
      const res = await arbitrateMatch(match.id, tournamentId, setWinners);
      if (res?.error) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-white">Arbitrage</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {match.player1.player_name} <span className="text-gray-600">vs</span> {match.player2.player_name}
          </p>
        </div>

        <div className="space-y-3">
          {sortedSets.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-400 w-16 shrink-0">Manche {i + 1}</span>
              <div className="flex gap-2 flex-1">
                <WinnerBtn
                  label={match.player1.player_name}
                  active={winners[s.id] === match.player1.id}
                  onClick={() => setWinner(s.id, match.player1.id)}
                />
                <WinnerBtn
                  label={match.player2.player_name}
                  active={winners[s.id] === match.player2.id}
                  onClick={() => setWinner(s.id, match.player2.id)}
                />
                <WinnerBtn
                  label="—"
                  active={winners[s.id] === null}
                  onClick={() => setWinner(s.id, null)}
                />
              </div>
            </div>
          ))}
        </div>

        {isDestructive && (
          <div className="rounded-lg bg-red-950/50 border border-red-800 p-3 space-y-2">
            <p className="text-sm text-red-300">
              ⚠️ Si le vainqueur change, cette correction supprimera les{" "}
              <strong>{laterMatchesCount} match{laterMatchesCount > 1 ? "s" : ""} déjà généré{laterMatchesCount > 1 ? "s" : ""}</strong>{" "}
              dans les tours suivants (et leurs scores). Cette action est irréversible.
            </p>
            <label className="flex items-start gap-2 text-sm text-red-200 cursor-pointer">
              <input
                type="checkbox"
                checked={ackDestructive}
                onChange={(e) => setAckDestructive(e.target.checked)}
                className="mt-0.5"
              />
              Je comprends et je confirme la correction.
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || (isDestructive && !ackDestructive)}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Valider la correction"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WinnerBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors truncate ${
        active
          ? "border-orange-500 bg-orange-500/20 text-orange-300"
          : "border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-400"
      }`}
    >
      {label}
    </button>
  );
}
