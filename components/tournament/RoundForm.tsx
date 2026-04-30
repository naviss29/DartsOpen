"use client";

import { useActionState } from "react";
import { addRound } from "@/lib/actions/tournament";

interface RoundFormProps {
  tournamentId: string;
}

export function RoundForm({ tournamentId }: RoundFormProps) {
  const [state, action, isPending] = useActionState(addRound, undefined);

  return (
    <form action={action} className="grid grid-cols-3 gap-3 items-end">
      <input type="hidden" name="tournament_id" value={tournamentId} />

      {state?.error && (
        <div className="col-span-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Type de jeu</label>
        <select name="game_type" required className={selectCn}>
          <option value="501">501</option>
          <option value="701">701</option>
          <option value="901">901</option>
          <option value="1001">1001</option>
          <option value="CRICKET">Cricket</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Entrée</label>
        <select name="entry_type" required className={selectCn}>
          <option value="SINGLE">Simple</option>
          <option value="DOUBLE">Double</option>
          <option value="TRIPLE">Triple</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Sortie</label>
        <select name="finish_type" required className={selectCn}>
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
          className="w-full rounded-lg border border-dashed border-green-400 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Ajout…" : "+ Ajouter cette manche"}
        </button>
      </div>
    </form>
  );
}

const selectCn =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";
