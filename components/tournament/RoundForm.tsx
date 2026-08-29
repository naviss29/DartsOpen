"use client";

import { useActionState, useState } from "react";
import { addRound } from "@/lib/actions/tournament";

interface RoundFormProps {
  tournamentId: string;
}

const DEFAULTS: Record<string, { entry: string; finish: string }> = {
  "501":    { entry: "SINGLE", finish: "DOUBLE" },
  "701":    { entry: "SINGLE", finish: "DOUBLE" },
  "901":    { entry: "SINGLE", finish: "DOUBLE" },
  "1001":   { entry: "SINGLE", finish: "DOUBLE" },
  "CRICKET":{ entry: "SINGLE", finish: "SINGLE" },
};

export function RoundForm({ tournamentId }: RoundFormProps) {
  const [state, action, isPending] = useActionState(addRound, undefined);
  const [gameType, setGameType] = useState("501");

  const defaults = DEFAULTS[gameType];

  return (
    <form action={action} className="grid grid-cols-3 gap-3 items-end">
      <input type="hidden" name="tournament_id" value={tournamentId} />

      {state?.error && (
        <div className="col-span-3 rounded-lg bg-danger-subtle border border-danger-border p-3 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="game_type" className="block text-xs font-medium text-brand-text-secondary mb-1">Type de jeu</label>
        <select id="game_type" name="game_type" required value={gameType} onChange={e => setGameType(e.target.value)} className={selectCn}>
          <option value="501">501</option>
          <option value="701">701</option>
          <option value="901">901</option>
          <option value="1001">1001</option>
          <option value="CRICKET">Cricket</option>
        </select>
      </div>

      <div>
        <label htmlFor="entry_type" className="block text-xs font-medium text-brand-text-secondary mb-1">Entrée</label>
        <select id="entry_type" name="entry_type" required key={`entry-${gameType}`} defaultValue={defaults.entry} className={selectCn}>
          <option value="SINGLE">Simple</option>
          <option value="DOUBLE">Double</option>
          <option value="TRIPLE">Triple</option>
        </select>
      </div>

      <div>
        <label htmlFor="finish_type" className="block text-xs font-medium text-brand-text-secondary mb-1">Sortie</label>
        <select id="finish_type" name="finish_type" required key={`finish-${gameType}`} defaultValue={defaults.finish} className={selectCn}>
          <option value="MASTER">Master</option>
          <option value="DOUBLE">Double</option>
          <option value="SINGLE">Simple</option>
          <option value="TRIPLE">Triple</option>
        </select>
      </div>

      <div className="col-span-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg border border-dashed border-brand-turquoise/50 px-4 py-2 text-sm font-medium text-brand-turquoise hover:bg-brand-turquoise/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Ajout…" : "+ Ajouter cette manche"}
        </button>
      </div>
    </form>
  );
}

const selectCn =
  "w-full rounded-lg border border-border-default px-3 py-2 text-sm text-brand-dark shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:border-transparent";
