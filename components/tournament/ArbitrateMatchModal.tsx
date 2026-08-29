"use client";

import { useState, useTransition } from "react";
import { arbitrateMatch } from "@/lib/actions/admin";
import { Dialog } from "@naviss29/design-system";
import Button from "@/components/ui/Button";

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
        className="text-xs text-warning hover:text-warning/80 transition-colors"
        title="Arbitrer ce match"
      >
        Arbitrer
      </button>
      <ArbitrateModal
        open={open}
        match={match}
        tournamentId={tournamentId}
        laterMatchesCount={laterMatchesCount}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function ArbitrateModal({ open, match, tournamentId, laterMatchesCount = 0, onClose }: Props & { open: boolean; onClose: () => void }) {
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
      open={open}
      title="Arbitrage"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <button
            onClick={handleSubmit}
            disabled={isPending || (isDestructive && !ackDestructive)}
            className="rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-white hover:bg-warning/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Valider la correction"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-brand-dark">
          {match.player1.player_name} <span className="text-brand-text-secondary">vs</span> {match.player2.player_name}
        </p>

        <div className="space-y-3">
          {sortedSets.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <span className="text-sm text-brand-text-secondary w-16 shrink-0">Manche {i + 1}</span>
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
          <div className="rounded-lg bg-danger-subtle border border-danger-border p-3 space-y-2">
            <p className="text-sm text-danger">
              ⚠️ Si le vainqueur change, cette correction supprimera les{" "}
              <strong>{laterMatchesCount} match{laterMatchesCount > 1 ? "s" : ""} déjà généré{laterMatchesCount > 1 ? "s" : ""}</strong>{" "}
              dans les tours suivants (et leurs scores). Cette action est irréversible.
            </p>
            <label className="flex items-start gap-2 text-sm text-danger cursor-pointer">
              <input
                type="checkbox"
                checked={ackDestructive}
                onChange={(e) => setAckDestructive(e.target.checked)}
                className="mt-0.5 accent-danger-solid"
              />
              Je comprends et je confirme la correction.
            </label>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
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
          ? "border-brand-turquoise bg-brand-turquoise/10 text-brand-turquoise"
          : "border-border-muted bg-surface text-brand-text-secondary hover:border-border-default"
      }`}
    >
      {label}
    </button>
  );
}
