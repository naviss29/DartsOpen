"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createTournament } from "@/lib/actions/tournament";

export function TournamentForm() {
  const [state, action, isPending] = useActionState(createTournament, undefined);
  const [quickMode, setQuickMode] = useState(state?.fields?.quick_mode === "true");

  const today = new Date().toISOString().split("T")[0];

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Mode tournoi rapide */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-900">Mode tournoi rapide</p>
            <p className="text-xs text-gray-500 mt-1">
              Double élimination bar / soirée. Chaque joueur a 2 vies. Le bracket se génère dynamiquement après chaque match.
            </p>
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
        {/* Champ hidden pour soumettre la valeur du toggle */}
        <input type="hidden" name="quick_mode" value={quickMode ? "true" : "false"} />
      </section>

      {/* Infos générales */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Informations générales</h2>

        <Field label="Nom du tournoi" error={state?.errors?.name?.[0]}>
          <input
            name="name"
            type="text"
            required
            defaultValue={state?.fields?.name}
            placeholder="Open de fléchettes d'Orléans 2026"
            className={inputCn}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" error={state?.errors?.date?.[0]}>
            <input name="date" type="date" required min={today} defaultValue={state?.fields?.date} className={inputCn} />
          </Field>
          <Field label="Lieu" error={state?.errors?.location?.[0]}>
            <input name="location" type="text" required defaultValue={state?.fields?.location} placeholder="Salle des fêtes" className={inputCn} />
          </Field>
        </div>
      </section>

      {/* Configuration tournoi */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Configuration</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre de joueurs max" error={state?.errors?.max_players?.[0]}>
            <input name="max_players" type="number" min="2" max="512" defaultValue={state?.fields?.max_players ?? "32"} required className={inputCn} />
          </Field>
          <Field label="Droits d'inscription (€ / joueur)" error={state?.errors?.entry_fee?.[0]}>
            <input name="entry_fee" type="number" min="0" defaultValue={state?.fields?.entry_fee ?? "10"} required className={inputCn} />
            <p className="mt-1 text-xs text-gray-400">Le total facturé = ce montant × nb de joueurs par équipe</p>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <Field label="Nombre de poules" error={state?.errors?.nb_pools?.[0]}>
              <input name="nb_pools" type="number" min="1" max="64" defaultValue={state?.fields?.nb_pools ?? "8"} required className={inputCn} />
            </Field>
          )}
          <Field label="Nombre de cibles disponibles" error={state?.errors?.nb_boards?.[0]}>
            <input name="nb_boards" type="number" min="1" max="32" defaultValue={state?.fields?.nb_boards ?? "4"} required className={inputCn} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <Field label="Joueurs par équipe" error={state?.errors?.players_per_team?.[0]}>
              <input name="players_per_team" type="number" min="1" max="10" defaultValue={state?.fields?.players_per_team ?? "2"} required className={inputCn} />
              <p className="mt-1 text-xs text-gray-400">Ex : 1 = solo, 2 = doublette</p>
            </Field>
          )}
          <Field label="Qualifiés par poule" error={state?.errors?.advancement_per_pool?.[0]}>
            <input name="advancement_per_pool" type="number" min="1" max="8" defaultValue={state?.fields?.advancement_per_pool ?? "1"} required className={inputCn} />
            <p className="mt-1 text-xs text-gray-400">Ex : 8 poules × 2 = 16 finalistes</p>
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Mode d&apos;inscription</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="registration_mode" value="ONLINE" defaultChecked={(state?.fields?.registration_mode ?? "ONLINE") === "ONLINE"} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">En ligne</p>
              <p className="text-xs text-gray-500">Les joueurs peuvent s&apos;inscrire et payer directement depuis la page publique du tournoi.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="registration_mode" value="ONSITE" defaultChecked={state?.fields?.registration_mode === "ONSITE"} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Sur place uniquement</p>
              <p className="text-xs text-gray-500">Pas d&apos;inscription en ligne. Les visiteurs verront un message d&apos;information. Vous gérez les inscriptions manuellement.</p>
            </div>
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Mode de saisie des scores</p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="scoring_mode" value="ELECTRONIC" defaultChecked={(state?.fields?.scoring_mode ?? "ELECTRONIC") !== "TRADITIONAL"} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Électronique</p>
              <p className="text-xs text-gray-500">Chaque équipe scanne le QR code et désigne le gagnant de la manche. L&apos;adversaire confirme.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="scoring_mode" value="TRADITIONAL" defaultChecked={state?.fields?.scoring_mode === "TRADITIONAL"} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Traditionnel</p>
              <p className="text-xs text-gray-500">Un marqueur saisit les scores volée par volée sur un seul appareil. Le compte à rebours est géré automatiquement.</p>
            </div>
          </label>
        </div>

        {!quickMode && (
          <p className="text-xs text-gray-500">
            Les manches (type de jeu, entrée, sortie) seront configurées après la création du tournoi.
          </p>
        )}
        {quickMode && (
          <p className="text-xs text-green-600">
            Mode rapide : les manches sont automatiques (501 → Cricket → 701 selon la phase).
          </p>
        )}
      </section>

      <div className="flex gap-3 justify-end">
        <Link
          href="/tournaments"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Annuler
        </Link>
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
