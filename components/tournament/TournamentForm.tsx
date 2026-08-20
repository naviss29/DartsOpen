"use client";

import { Fragment, useActionState, useState } from "react";
import { createTournament } from "@/lib/actions/tournament";
import { Alert, Card, FormField, Input } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import { FREE_TIER_MAX_PLAYERS, PAID_TIER_MAX_PLAYERS, hasConfirmedTournamentSizeEntitlement } from "@/lib/entitlements/constants";
import { DEFAULT_MAX_PLAYERS, DEFAULT_NB_POOLS, DEFAULT_NB_BOARDS } from "@/lib/tournament/defaults";
import type { StripeConnectStatus } from "@/lib/payments/onlinePaymentGuard";

interface Props {
  /**
   * État Stripe Connect de l'organisation courante — recalculé serveur, jamais un booléen
   * client (DO-PAYMENT-GUARD-001). Trois états distincts depuis DARTSOPEN-MONETIZATION-002
   * (audit priorité 4) : INDETERMINATE (échec/état inconnu côté SterPlatform) n'est jamais
   * assimilé silencieusement à NOT_OPERATIONAL — le paiement en ligne reste indisponible dans
   * les deux cas (repli prudent), mais le message affiché diffère.
   */
  stripeConnectStatus: StripeConnectStatus;
  stripeConnectUrl: string;
  /** Droits DartsOpen de l'organisation courante — recalculés serveur (DARTSOPEN-MONETIZATION-001), jamais déduits côté client. */
  hasActiveSubscription: boolean;
  availableCredits: number;
  subscriptionUrl: string;
  creditPurchaseUrl: string;
}

export function TournamentForm({
  stripeConnectStatus,
  stripeConnectUrl,
  hasActiveSubscription,
  availableCredits,
  subscriptionUrl,
  creditPurchaseUrl,
}: Props) {
  const [state, action, isPending] = useActionState(createTournament, undefined);
  const [quickMode, setQuickMode] = useState(state?.fields?.quick_mode === "true");
  // DO-STABILIZATION-001 (Problème 1) — sans entitlement confirmé, le défaut ET le plafond du
  // champ sont bornés à FREE_TIER_MAX_PLAYERS (10), jamais DEFAULT_MAX_PLAYERS (16) tel quel :
  // c'est exactement l'incohérence constatée en recette (16 affiché à côté de "jusqu'à 10").
  const hasEntitlement = hasConfirmedTournamentSizeEntitlement(hasActiveSubscription, availableCredits);
  const maxPlayersCap = hasEntitlement ? PAID_TIER_MAX_PLAYERS : FREE_TIER_MAX_PLAYERS;
  const [maxPlayers, setMaxPlayers] = useState(
    state?.fields?.max_players ?? String(Math.min(DEFAULT_MAX_PLAYERS, maxPlayersCap))
  );
  const [entryFee, setEntryFee] = useState(state?.fields?.entry_fee ?? "10");
  // DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002) — générée une seule fois à
  // l'instanciation du formulaire, jamais régénérée entre deux soumissions (double-clic, relance
  // réseau après échec) : c'est ce qui rend la consommation d'un crédit tournoi réellement
  // idempotente côté serveur (lib/actions/tournament.ts).
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const today = new Date().toISOString().split("T")[0];
  const canReceivePayments = stripeConnectStatus === "OPERATIONAL";

  /**
   * DO-STABILIZATION-001 — clampe toute saisie/incrémentation au-delà du plafond réel : le
   * champ HTML `max` (ci-dessous) bloque déjà la soumission native, mais un clic répété sur les
   * flèches ou une saisie clavier rapide ne doit jamais afficher transitoirement une valeur >10
   * sans entitlement. Jamais côté serveur — resolveTournamentSizeEntitlement()/
   * requiresEntitlementCheck() (lib/actions/tournament.ts) restent l'unique source de vérité.
   */
  function handleMaxPlayersChange(raw: string) {
    if (raw === "") { setMaxPlayers(raw); return; }
    const n = Number(raw);
    setMaxPlayers(Number.isFinite(n) ? String(Math.min(n, maxPlayersCap)) : raw);
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
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
            <Fragment key="quick-mode-fields">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Nombre de joueurs max"
                  id="max_players"
                  error={state?.errors?.max_players?.[0]}
                  hint={hasEntitlement ? undefined : `Accès gratuit : jusqu'à ${FREE_TIER_MAX_PLAYERS} joueurs.`}
                >
                  <Input
                    id="max_players"
                    name="max_players"
                    type="number"
                    min="2"
                    max={maxPlayersCap}
                    value={maxPlayers}
                    onChange={(e) => handleMaxPlayersChange(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Nombre de cibles disponibles" id="nb_boards" error={state?.errors?.nb_boards?.[0]}>
                  <Input id="nb_boards" name="nb_boards" type="number" min="1" max="32" defaultValue={state?.fields?.nb_boards ?? String(DEFAULT_NB_BOARDS)} required />
                </FormField>
              </div>
              {!hasEntitlement && (
                <Alert tone="info">
                  <p className="font-medium">Plus de {FREE_TIER_MAX_PLAYERS} joueurs nécessite un accès payant DartsOpen.</p>
                  <p className="mt-1">
                    Achetez un{" "}
                    <a href={creditPurchaseUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                      crédit tournoi (4,90€, valable pour ce tournoi)
                    </a>{" "}
                    ou souscrivez un{" "}
                    <a href={subscriptionUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                      abonnement DartsOpen (6,90€/mois ou 69€/an)
                    </a>{" "}
                    depuis BApps Studio.
                  </p>
                </Alert>
              )}
              {/* Valeurs forcées en mode rapide — invisibles pour l'organisateur */}
              <input type="hidden" name="entry_fee" value="0" />
              <input type="hidden" name="payment_mode" value="ONSITE" />
              <input type="hidden" name="nb_pools" value="1" />
              <input type="hidden" name="players_per_team" value="1" />
              <input type="hidden" name="advancement_per_pool" value="1" />
              <input type="hidden" name="registration_mode" value="ONSITE" />
              <input type="hidden" name="scoring_mode" value="ELECTRONIC" />
              <p className="text-xs text-brand-turquoise">
                Manches automatiques (501 → Cricket → 701 selon la phase) · Inscriptions sur place · Gratuit
              </p>
            </Fragment>
          ) : (
            /* Mode standard : tous les champs */
            <Fragment key="standard-mode-fields">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Nombre de joueurs max"
                  id="max_players"
                  error={state?.errors?.max_players?.[0]}
                  hint={hasEntitlement ? undefined : `Accès gratuit : jusqu'à ${FREE_TIER_MAX_PLAYERS} joueurs.`}
                >
                  <Input
                    id="max_players"
                    name="max_players"
                    type="number"
                    min="2"
                    max={maxPlayersCap}
                    value={maxPlayers}
                    onChange={(e) => handleMaxPlayersChange(e.target.value)}
                    required
                  />
                </FormField>
                <FormField
                  label="Droits d'inscription (€ / joueur)"
                  id="entry_fee"
                  error={state?.errors?.entry_fee?.[0]}
                  hint="Le total facturé = ce montant × nb de joueurs par équipe"
                >
                  <Input
                    id="entry_fee"
                    name="entry_fee"
                    type="number"
                    min="0"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                    required
                  />
                </FormField>
              </div>

              {!hasEntitlement && (
                <Alert tone="info">
                  <p className="font-medium">Plus de {FREE_TIER_MAX_PLAYERS} joueurs nécessite un accès payant DartsOpen.</p>
                  <p className="mt-1">
                    Achetez un{" "}
                    <a href={creditPurchaseUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                      crédit tournoi (4,90€, valable pour ce tournoi)
                    </a>{" "}
                    ou souscrivez un{" "}
                    <a href={subscriptionUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                      abonnement DartsOpen (6,90€/mois ou 69€/an)
                    </a>{" "}
                    depuis BApps Studio.
                  </p>
                </Alert>
              )}

              {Number(entryFee) > 0 && (
                canReceivePayments ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-4">
                    <p className="text-sm font-medium text-brand-dark">Mode de paiement</p>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="radio" name="payment_mode" value="ONLINE" defaultChecked={(state?.fields?.payment_mode ?? "ONLINE") === "ONLINE"} className="mt-0.5 accent-brand-turquoise" />
                      <div>
                        <p className="text-sm font-medium text-brand-dark">En ligne</p>
                        <p className="text-xs text-brand-text-secondary">Les joueurs paient en ligne au moment de l&apos;inscription.</p>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="radio" name="payment_mode" value="ONSITE" defaultChecked={state?.fields?.payment_mode === "ONSITE"} className="mt-0.5 accent-brand-turquoise" />
                      <div>
                        <p className="text-sm font-medium text-brand-dark">Sur place</p>
                        <p className="text-xs text-brand-text-secondary">Les droits d&apos;inscription sont réglés le jour du tournoi.</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <>
                    {/* DO-STABILIZATION-001 (Problème 2) — plus de "faux choix" : dès que Stripe
                        n'est pas confirmé OPERATIONAL (absent, non opérationnel, ou état
                        indéterminé — les trois cas traités identiquement ici), les radios
                        disparaissent entièrement, ONLINE ne reste jamais sélectionné visuellement,
                        et le grand bandeau d'avertissement disparaît au profit d'une simple
                        information secondaire sobre. Le serveur (isOnlinePaymentAllowed) refuse de
                        toute façon tout payload forgé avec ONLINE tant que Stripe n'est pas
                        confirmé opérationnel — ce hidden input n'est qu'un confort, jamais la
                        barrière de sécurité. */}
                    <input type="hidden" name="payment_mode" value="ONSITE" />
                    <p className="text-xs text-brand-text-secondary">
                      Paiement des inscriptions : sur place ·{" "}
                      <a href={stripeConnectUrl} target="_blank" rel="noreferrer" className="underline">
                        configurer Stripe Connect
                      </a>
                    </p>
                  </>
                )
              )}
              {Number(entryFee) <= 0 && <input type="hidden" name="payment_mode" value="ONSITE" />}

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nombre de poules" id="nb_pools" error={state?.errors?.nb_pools?.[0]}>
                  <Input id="nb_pools" name="nb_pools" type="number" min="1" max="64" defaultValue={state?.fields?.nb_pools ?? String(DEFAULT_NB_POOLS)} required />
                </FormField>
                <FormField label="Nombre de cibles disponibles" id="nb_boards" error={state?.errors?.nb_boards?.[0]}>
                  <Input id="nb_boards" name="nb_boards" type="number" min="1" max="32" defaultValue={state?.fields?.nb_boards ?? String(DEFAULT_NB_BOARDS)} required />
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
                    <p className="text-xs text-brand-text-secondary">Les joueurs peuvent s&apos;inscrire directement depuis la page publique du tournoi.</p>
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
            </Fragment>
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
