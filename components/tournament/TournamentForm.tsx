"use client";

import { useActionState, useState } from "react";
import { createTournament } from "@/lib/actions/tournament";
import { Alert, Card, FormField, Input } from "@naviss29/design-system";
import Button from "@/components/ui/Button";

export function TournamentForm() {
  const [state, action, isPending] = useActionState(createTournament, undefined);
  const [quickMode, setQuickMode] = useState(state?.fields?.quick_mode === "true");

  const today = new Date().toISOString().split("T")[0];

  return (
    <form action={action} className="space-y-6">
      {state?.error && <Alert tone="error">{state.error}</Alert>}

      {/* Mode tournoi rapide */}
      <section>
        <Card>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-brand-dark">Mode tournoi rapide</p>
              <p className="mt-1 text-xs text-brand-text-secondary">
                Double élimination bar / soirée. Chaque joueur a 2 vies. Le bracket se génère dynamiquement après chaque match.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quickMode}
              onClick={() => setQuickMode((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:ring-offset-2 ${quickMode ? "bg-brand-turquoise" : "bg-slate-300"}`}
            >
              <span
                className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${quickMode ? "translate-x-5.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
          {/* Champ hidden pour soumettre la valeur du toggle */}
          <input type="hidden" name="quick_mode" value={quickMode ? "true" : "false"} />
        </Card>
      </section>

      {/* Infos générales */}
      <section>
        <Card className="space-y-4">
          <h2 className="font-semibold text-brand-dark">Informations générales</h2>

          <FormField label="Nom du tournoi" id="name" error={state?.errors?.name?.[0]}>
            <Input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={state?.fields?.name}
              placeholder="Open de fléchettes d'Orléans 2026"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" id="date" error={state?.errors?.date?.[0]}>
              <Input id="date" name="date" type="date" required min={today} defaultValue={state?.fields?.date} />
            </FormField>
            <FormField label="Lieu" id="location" error={state?.errors?.location?.[0]}>
              <Input id="location" name="location" type="text" required defaultValue={state?.fields?.location} placeholder="Salle des fêtes" />
            </FormField>
          </div>
        </Card>
      </section>

      {/* Configuration tournoi */}
      <section>
        <Card className="space-y-4">
          <h2 className="font-semibold text-brand-dark">Configuration</h2>

          {quickMode ? (
            /* Mode rapide : seulement nb joueurs et nb cibles */
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nombre de joueurs max" id="max_players" error={state?.errors?.max_players?.[0]}>
                  <Input id="max_players" name="max_players" type="number" min="2" max="512" defaultValue={state?.fields?.max_players ?? "32"} required />
                </FormField>
                <FormField label="Nombre de cibles disponibles" id="nb_boards" error={state?.errors?.nb_boards?.[0]}>
                  <Input id="nb_boards" name="nb_boards" type="number" min="1" max="32" defaultValue={state?.fields?.nb_boards ?? "4"} required />
                </FormField>
              </div>
              {/* Valeurs forcées en mode rapide — invisibles pour l'organisateur */}
              <input type="hidden" name="entry_fee" value="0" />
              <input type="hidden" name="nb_pools" value="1" />
              <input type="hidden" name="players_per_team" value="1" />
              <input type="hidden" name="advancement_per_pool" value="1" />
              <input type="hidden" name="registration_mode" value="ONSITE" />
              <input type="hidden" name="scoring_mode" value="ELECTRONIC" />
              <p className="text-xs text-brand-turquoise">
                Manches automatiques (501 → Cricket → 701 selon la phase) · Inscriptions sur place · Gratuit
              </p>
            </>
          ) : (
            /* Mode standard : tous les champs */
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nombre de joueurs max" id="max_players" error={state?.errors?.max_players?.[0]}>
                  <Input id="max_players" name="max_players" type="number" min="2" max="512" defaultValue={state?.fields?.max_players ?? "32"} required />
                </FormField>
                <FormField label="Droits d'inscription (€ / joueur)" id="entry_fee" error={state?.errors?.entry_fee?.[0]} hint="Le total facturé = ce montant × nb de joueurs par équipe">
                  <Input id="entry_fee" name="entry_fee" type="number" min="0" defaultValue={state?.fields?.entry_fee ?? "10"} required />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nombre de poules" id="nb_pools" error={state?.errors?.nb_pools?.[0]}>
                  <Input id="nb_pools" name="nb_pools" type="number" min="1" max="64" defaultValue={state?.fields?.nb_pools ?? "8"} required />
                </FormField>
                <FormField label="Nombre de cibles disponibles" id="nb_boards" error={state?.errors?.nb_boards?.[0]}>
                  <Input id="nb_boards" name="nb_boards" type="number" min="1" max="32" defaultValue={state?.fields?.nb_boards ?? "4"} required />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Joueurs par équipe" id="players_per_team" error={state?.errors?.players_per_team?.[0]} hint="Ex : 1 = solo, 2 = doublette">
                  <Input id="players_per_team" name="players_per_team" type="number" min="1" max="10" defaultValue={state?.fields?.players_per_team ?? "2"} required />
                </FormField>
                <FormField label="Qualifiés par poule" id="advancement_per_pool" error={state?.errors?.advancement_per_pool?.[0]} hint="Ex : 8 poules × 2 = 16 finalistes">
                  <Input id="advancement_per_pool" name="advancement_per_pool" type="number" min="1" max="8" defaultValue={state?.fields?.advancement_per_pool ?? "1"} required />
                </FormField>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-brand-dark">Mode d&apos;inscription</p>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="registration_mode" value="ONLINE" defaultChecked={(state?.fields?.registration_mode ?? "ONLINE") === "ONLINE"} className="mt-0.5 accent-brand-turquoise" />
                  <div>
                    <p className="text-sm font-medium text-brand-dark">En ligne</p>
                    <p className="text-xs text-brand-text-secondary">Les joueurs peuvent s&apos;inscrire et payer directement depuis la page publique du tournoi.</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="registration_mode" value="ONSITE" defaultChecked={state?.fields?.registration_mode === "ONSITE"} className="mt-0.5 accent-brand-turquoise" />
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Sur place uniquement</p>
                    <p className="text-xs text-brand-text-secondary">Pas d&apos;inscription en ligne. Les visiteurs verront un message d&apos;information. Vous gérez les inscriptions manuellement.</p>
                  </div>
                </label>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-brand-dark">Mode de saisie des scores</p>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="scoring_mode" value="ELECTRONIC" defaultChecked={(state?.fields?.scoring_mode ?? "ELECTRONIC") !== "TRADITIONAL"} className="mt-0.5 accent-brand-turquoise" />
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Électronique</p>
                    <p className="text-xs text-brand-text-secondary">Chaque équipe scanne le QR code et désigne le gagnant de la manche. L&apos;adversaire confirme.</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="scoring_mode" value="TRADITIONAL" defaultChecked={state?.fields?.scoring_mode === "TRADITIONAL"} className="mt-0.5 accent-brand-turquoise" />
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Traditionnel</p>
                    <p className="text-xs text-brand-text-secondary">Un marqueur saisit les scores volée par volée sur un seul appareil. Le compte à rebours est géré automatiquement.</p>
                  </div>
                </label>
              </div>

              <p className="text-xs text-brand-text-secondary">
                Les manches (type de jeu, entrée, sortie) seront configurées après la création du tournoi.
              </p>
            </>
          )}
        </Card>
      </section>

      <div className="flex justify-end gap-3">
        <Button href="/tournaments" variant="secondary">
          Annuler
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Création…" : "Créer le tournoi"}
        </Button>
      </div>
    </form>
  );
}
