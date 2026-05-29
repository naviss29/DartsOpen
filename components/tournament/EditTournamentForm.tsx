"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { updateTournament } from "@/lib/actions/tournament";

interface Props {
  tournament: {
    id: string;
    name: string;
    date: string;
    location: string;
    max_players: number;
    entry_fee: number;
    nb_pools: number;
    nb_boards: number;
    advancement_per_pool: number;
    players_per_team: number;
    registration_mode: string;
    scoring_mode: string;
    quick_mode: boolean;
  };
}

export function EditTournamentForm({ tournament }: Props) {
  const [state, action, isPending] = useActionState(updateTournament, undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [quickMode, setQuickMode] = useState(
    state?.fields?.quick_mode === "true" ? true : state?.fields?.quick_mode === "false" ? false : tournament.quick_mode
  );
  const prevPending = useRef(false);

  useEffect(() => {
    if (prevPending.current && !isPending && state === undefined) {
      setIsOpen(false);
    }
    prevPending.current = isPending;
  }, [isPending, state]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <span className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>▶</span>
        {isOpen ? "Masquer les modifications" : "Modifier le tournoi"}
      </button>

      {isOpen && (
    <form key={state?.ts ?? "initial"} action={action} className="space-y-4">
      <input type="hidden" name="tournament_id" value={tournament.id} />
      <input type="hidden" name="quick_mode" value={quickMode ? "true" : "false"} />

      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Mode rapide */}
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-900">Mode tournoi rapide</p>
            <p className="text-xs text-gray-500 mt-0.5">Double élimination — 2 vies par joueur, bracket dynamique.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={quickMode}
            onClick={() => setQuickMode((v) => !v)}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${quickMode ? "bg-green-500" : "bg-gray-300"}`}
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow transition-transform translate-y-0.5 ${quickMode ? "translate-x-5.5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom du tournoi</label>
          <input
            name="name"
            type="text"
            required
            defaultValue={state?.fields?.name ?? tournament.name}
            className={inputCn}
          />
          {state?.errors?.name && <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            name="date"
            type="date"
            required
            defaultValue={state?.fields?.date ?? tournament.date.split("T")[0]}
            className={inputCn}
          />
          {state?.errors?.date && <p className="mt-1 text-xs text-red-600">{state.errors.date[0]}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
          <input
            name="location"
            type="text"
            required
            defaultValue={state?.fields?.location ?? tournament.location}
            className={inputCn}
          />
          {state?.errors?.location && <p className="mt-1 text-xs text-red-600">{state.errors.location[0]}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Joueurs max</label>
          <input
            name="max_players"
            type="number"
            min="2"
            max="512"
            required
            defaultValue={state?.fields?.max_players ?? tournament.max_players}
            className={inputCn}
          />
          {state?.errors?.max_players && <p className="mt-1 text-xs text-red-600">{state.errors.max_players[0]}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Droits d&apos;inscription (€ / joueur)</label>
          <input
            name="entry_fee"
            type="number"
            min="0"
            required
            defaultValue={state?.fields?.entry_fee ?? tournament.entry_fee / 100}
            className={inputCn}
          />
          {state?.errors?.entry_fee && <p className="mt-1 text-xs text-red-600">{state.errors.entry_fee[0]}</p>}
        </div>

        {/* Nombre de poules : verrouillé à 1 en mode rapide */}
        {quickMode ? (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Nombre de poules</label>
            <div className={`${inputCn} bg-gray-50 text-gray-400 cursor-not-allowed flex items-center gap-2`}>
              <span>1</span>
              <span className="text-xs">(mode rapide)</span>
            </div>
            <input type="hidden" name="nb_pools" value="1" />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de poules</label>
            <input
              name="nb_pools"
              type="number"
              min="1"
              max="64"
              required
              defaultValue={state?.fields?.nb_pools ?? tournament.nb_pools}
              className={inputCn}
            />
            {state?.errors?.nb_pools && <p className="mt-1 text-xs text-red-600">{state.errors.nb_pools[0]}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de cibles</label>
          <input
            name="nb_boards"
            type="number"
            min="1"
            max="32"
            required
            defaultValue={state?.fields?.nb_boards ?? tournament.nb_boards}
            className={inputCn}
          />
          {state?.errors?.nb_boards && <p className="mt-1 text-xs text-red-600">{state.errors.nb_boards[0]}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Qualifiés par poule</label>
          <input
            name="advancement_per_pool"
            type="number"
            min="1"
            max="8"
            required
            defaultValue={state?.fields?.advancement_per_pool ?? tournament.advancement_per_pool}
            className={inputCn}
          />
          {state?.errors?.advancement_per_pool && <p className="mt-1 text-xs text-red-600">{state.errors.advancement_per_pool[0]}</p>}
        </div>

        {/* Joueurs par équipe : verrouillé à 1 en mode rapide */}
        {quickMode ? (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Joueurs par équipe</label>
            <div className={`${inputCn} bg-gray-50 text-gray-400 cursor-not-allowed flex items-center gap-2`}>
              <span>1</span>
              <span className="text-xs">(mode rapide)</span>
            </div>
            <input type="hidden" name="players_per_team" value="1" />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Joueurs par équipe</label>
            <input
              name="players_per_team"
              type="number"
              min="1"
              max="10"
              required
              defaultValue={state?.fields?.players_per_team ?? tournament.players_per_team}
              className={inputCn}
            />
            {state?.errors?.players_per_team && <p className="mt-1 text-xs text-red-600">{state.errors.players_per_team[0]}</p>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">Mode d&apos;inscription</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="registration_mode" value="ONLINE" defaultChecked={(state?.fields?.registration_mode ?? tournament.registration_mode) === "ONLINE"} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">En ligne</p>
            <p className="text-xs text-gray-500">Les joueurs s&apos;inscrivent depuis la page publique.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="registration_mode" value="ONSITE" defaultChecked={(state?.fields?.registration_mode ?? tournament.registration_mode) === "ONSITE"} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Sur place uniquement</p>
            <p className="text-xs text-gray-500">Pas d&apos;inscription en ligne. Gestion manuelle uniquement.</p>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">Mode de saisie des scores</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="scoring_mode" value="ELECTRONIC" defaultChecked={(state?.fields?.scoring_mode ?? tournament.scoring_mode) !== "TRADITIONAL"} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Électronique</p>
            <p className="text-xs text-gray-500">Chaque équipe désigne le gagnant depuis son téléphone, l&apos;adversaire confirme.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="radio" name="scoring_mode" value="TRADITIONAL" defaultChecked={(state?.fields?.scoring_mode ?? tournament.scoring_mode) === "TRADITIONAL"} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Traditionnel</p>
            <p className="text-xs text-gray-500">Un marqueur saisit les scores volée par volée. Compte à rebours automatique.</p>
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </div>
    </form>
      )}
    </div>
  );
}

const inputCn =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";
