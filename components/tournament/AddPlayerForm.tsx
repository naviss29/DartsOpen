"use client";

import { useActionState } from "react";
import { addPlayer } from "@/lib/actions/player";

export function AddPlayerForm({ tournamentId }: { tournamentId: string }) {
  const [state, action, isPending] = useActionState(addPlayer, undefined);

  return (
    <form action={action} className="grid grid-cols-3 gap-3 items-end">
      <input type="hidden" name="tournament_id" value={tournamentId} />

      {state?.error && (
        <div className="col-span-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
        <input
          name="player_name"
          type="text"
          required
          placeholder="Jean Dupont"
          className={inputCn}
        />
        {state?.errors?.player_name && (
          <p className="mt-1 text-xs text-red-600">{state.errors.player_name[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
        <input
          name="player_email"
          type="email"
          required
          placeholder="jean@exemple.fr"
          className={inputCn}
        />
        {state?.errors?.player_email && (
          <p className="mt-1 text-xs text-red-600">{state.errors.player_email[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
        <input
          name="player_phone"
          type="tel"
          placeholder="06 00 00 00 00"
          className={inputCn}
        />
      </div>

      <div className="col-span-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Inscription…" : "Inscrire le joueur"}
        </button>
      </div>
    </form>
  );
}

const inputCn =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";
