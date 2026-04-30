"use client";

import { useActionState } from "react";
import { createTournament } from "@/lib/actions/tournament";

export function TournamentForm() {
  const [state, action, isPending] = useActionState(createTournament, undefined);

  const today = new Date().toISOString().split("T")[0];

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Infos générales */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Informations générales</h2>

        <Field label="Nom du tournoi" error={state?.errors?.name?.[0]}>
          <input
            name="name"
            type="text"
            required
            placeholder="Open de fléchettes d'Orléans 2026"
            className={inputCn}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" error={state?.errors?.date?.[0]}>
            <input name="date" type="date" required min={today} className={inputCn} />
          </Field>
          <Field label="Lieu" error={state?.errors?.location?.[0]}>
            <input name="location" type="text" required placeholder="Salle des fêtes" className={inputCn} />
          </Field>
        </div>
      </section>

      {/* Configuration tournoi */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Configuration</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre de joueurs max" error={state?.errors?.max_players?.[0]}>
            <input name="max_players" type="number" min="2" max="512" defaultValue="32" required className={inputCn} />
          </Field>
          <Field label="Droits d'inscription (€)" error={state?.errors?.entry_fee?.[0]}>
            <input name="entry_fee" type="number" min="0" defaultValue="10" required className={inputCn} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre de poules" error={state?.errors?.nb_pools?.[0]}>
            <input name="nb_pools" type="number" min="1" max="64" defaultValue="8" required className={inputCn} />
          </Field>
          <Field label="Nombre de cibles disponibles" error={state?.errors?.nb_boards?.[0]}>
            <input name="nb_boards" type="number" min="1" max="32" defaultValue="4" required className={inputCn} />
          </Field>
        </div>

        <Field label="Qualifiés par poule (phases finales)" error={state?.errors?.advancement_per_pool?.[0]}>
          <input name="advancement_per_pool" type="number" min="1" max="8" defaultValue="1" required className={inputCn} />
          <p className="mt-1 text-xs text-gray-400">
            Ex : 8 poules × 2 qualifiés = 16 finalistes
          </p>
        </Field>

        <p className="text-xs text-gray-500">
          Les manches (type de jeu, entrée, sortie) seront configurées après la création du tournoi.
        </p>
      </section>

      <div className="flex gap-3 justify-end">
        <a
          href="/tournaments"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Annuler
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Création…" : "Créer le tournoi"}
        </button>
      </div>
    </form>
  );
}

const inputCn =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
