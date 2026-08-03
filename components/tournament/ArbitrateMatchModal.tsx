"use client";

import { useState, useTransition } from "react";
import { arbitrateMatch } from "@/lib/actions/admin";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

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
        className="text-xs text-darts-gold-dark hover:text-darts-gold transition-colors"
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
    <Dialog
      title="Arbitrage"
      description={`${match.player1.player_name} vs ${match.player2.player_name}`}
      onClose={onClose}
      className="space-y-5"
    >
      <div className="space-y-3">
        {sortedSets.map((s, i) => (
          <div key={s.id} className="flex items-center justify-between gap-4">
            <span className="text-sm text-darts-text-secondary w-16 shrink-0">Manche {i + 1}</span>
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
        <div className="rounded-lg bg-darts-red/10 border border-darts-red/40 p-3 space-y-2">
          <p className="text-sm text-darts-red">
            ⚠️ Si le vainqueur change, cette correction supprimera les{" "}
            <strong>{laterMatchesCount} match{laterMatchesCount > 1 ? "s" : ""} déjà généré{laterMatchesCount > 1 ? "s" : ""}</strong>{" "}
            dans les tours suivants (et leurs scores). Cette action est irréversible.
          </p>
          <label className="flex items-start gap-2 text-sm text-darts-red cursor-pointer">
            <input
              type="checkbox"
              checked={ackDestructive}
              onChange={(e) => setAckDestructive(e.target.checked)}
              className="mt-0.5 accent-darts-red"
            />
            Je comprends et je confirme la correction.
          </label>
        </div>
      )}

      {error && <p className="text-sm text-darts-red">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <button
          onClick={handleSubmit}
          disabled={isPending || (isDestructive && !ackDestructive)}
          className="rounded-lg bg-darts-gold-dark px-4 py-2 text-sm font-semibold text-white hover:bg-darts-gold-dark/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Enregistrement…" : "Valider la correction"}
        </button>
      </div>
    </Dialog>
  );
}

function WinnerBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors truncate ${
        active
          ? "border-darts-gold bg-darts-gold/20 text-darts-gold-dark"
          : "border-darts-border bg-darts-surface-raised text-darts-text-secondary hover:border-darts-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}
