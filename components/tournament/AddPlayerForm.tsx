"use client";

import { useActionState } from "react";
import { addPlayer } from "@/lib/actions/player";

interface Props {
  tournamentId: string;
  playersPerTeam: number;
}

export function AddPlayerForm({ tournamentId, playersPerTeam }: Props) {
  const [state, action, isPending] = useActionState(addPlayer, undefined);
  const isTeam = playersPerTeam > 1;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="players_per_team" value={playersPerTeam} />

      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {isTeam && (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom de l&apos;équipe *</label>
            <input
              name="player_name"
              type="text"
              required
              placeholder="Les Flèches d'Or"
              className={inputCn}
            />
            {state?.errors?.player_name && (
              <p className="mt-1 text-xs text-red-600">{state.errors.player_name[0]}</p>
            )}
          </div>
        )}

        <div className={isTeam ? "col-span-2" : "col-span-1"}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isTeam ? `Pseudos des joueurs *` : "Nom complet *"}
          </label>
          <div className={isTeam ? "grid grid-cols-2 gap-2" : ""}>
            {Array.from({ length: playersPerTeam }, (_, i) => (
              <input
                key={i}
                name={`player_pseudo_${i}`}
                type="text"
                required
                minLength={2}
                placeholder={isTeam ? `Joueur ${i + 1}` : "Jean Dupont"}
                className={inputCn}
              />
            ))}
          </div>
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
            placeholder="0612345678"
            className={inputCn}
          />
          {state?.errors?.player_phone && (
            <p className="mt-1 text-xs text-red-600">{state.errors.player_phone[0]}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Inscription…" : isTeam ? "Inscrire l'équipe" : "Inscrire le joueur"}
      </button>
    </form>
  );
}

const inputCn =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";
