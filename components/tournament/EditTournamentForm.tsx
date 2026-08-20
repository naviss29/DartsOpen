"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { updateTournament } from "@/lib/actions/tournament";
import { Alert, Card, FormField, Input } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import { FREE_TIER_MAX_PLAYERS, PAID_TIER_MAX_PLAYERS, hasConfirmedTournamentSizeEntitlement } from "@/lib/entitlements/constants";
import type { StripeConnectStatus } from "@/lib/payments/onlinePaymentGuard";

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
    payment_mode: string;
    scoring_mode: string;
    quick_mode: boolean;
  };
  /**
   * État Stripe Connect de l'organisation courante — recalculé serveur (DO-PAYMENT-GUARD-001).
   * Trois états distincts depuis DARTSOPEN-MONETIZATION-002 (audit priorité 4) — voir
   * TournamentForm.tsx pour le détail.
   */
  stripeConnectStatus: StripeConnectStatus;
  stripeConnectUrl: string;
  /** Droits DartsOpen de l'organisation courante — recalculés serveur (DARTSOPEN-MONETIZATION-001), jamais déduits côté client. */
  hasActiveSubscription: boolean;
  availableCredits: number;
  subscriptionUrl: string;
  creditPurchaseUrl: string;
}

export function EditTournamentForm({
  tournament,
  stripeConnectStatus,
  stripeConnectUrl,
  hasActiveSubscription,
  availableCredits,
  subscriptionUrl,
  creditPurchaseUrl,
}: Props) {
  const canReceivePayments = stripeConnectStatus === "OPERATIONAL";
  const [state, action, isPending] = useActionState(updateTournament, undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [quickMode, setQuickMode] = useState(
    state?.fields?.quick_mode === "true" ? true : state?.fields?.quick_mode === "false" ? false : tournament.quick_mode
  );
  const [maxPlayers, setMaxPlayers] = useState(state?.fields?.max_players ?? String(tournament.max_players));
  const [entryFee, setEntryFee] = useState(state?.fields?.entry_fee ?? String(tournament.entry_fee / 100));
  const prevPending = useRef(false);

  useEffect(() => {
    if (prevPending.current && !isPending && state === undefined) {
      setIsOpen(false);
    }
    prevPending.current = isPending;
  }, [isPending, state]);

  // DO-STABILIZATION-001 (Problème 1) — même plafond que la création. `maxPlayersCap` borne la
  // saisie à partir de MAINTENANT (handleMaxPlayersChange ci-dessous) ; la valeur CHARGÉE depuis
  // un tournoi existant n'est jamais silencieusement réécrite (voir exceedsCapWithoutEntitlement).
  const hasEntitlement = hasConfirmedTournamentSizeEntitlement(hasActiveSubscription, availableCredits);
  const maxPlayersCap = hasEntitlement ? PAID_TIER_MAX_PLAYERS : FREE_TIER_MAX_PLAYERS;

  function handleMaxPlayersChange(raw: string) {
    if (raw === "") { setMaxPlayers(raw); return; }
    const n = Number(raw);
    setMaxPlayers(Number.isFinite(n) ? String(Math.min(n, maxPlayersCap)) : raw);
  }

  // DO-STABILIZATION-001 — état "correction nécessaire" (mission Problème 1, UI) : un tournoi
  // créé AVANT cette mission (ou dont l'entitlement a expiré depuis) peut avoir max_players > 10
  // déjà en base, sans qu'aucune saisie utilisateur n'en soit la cause. Jamais réécrit
  // silencieusement — l'attribut `max` (ci-dessous) empêchera de toute façon la soumission tant
  // que ce n'est pas corrigé (validation HTML5 native), mais l'organisateur doit comprendre
  // pourquoi explicitement plutôt que de deviner face à un formulaire qui refuse de s'envoyer.
  const exceedsCapWithoutEntitlement = !hasEntitlement && Number(maxPlayers) > maxPlayersCap;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-brand-text-secondary transition-colors hover:text-brand-dark"
      >
        <span className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>▶</span>
        {isOpen ? "Masquer les modifications" : "Modifier le tournoi"}
      </button>

      {isOpen && (
    <form key={state?.ts ?? "initial"} action={action} className="space-y-4">
      <input type="hidden" name="tournament_id" value={tournament.id} />
      <input type="hidden" name="quick_mode" value={quickMode ? "true" : "false"} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      {/* Mode rapide */}
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-brand-dark">Mode tournoi rapide</p>
            <p className="mt-0.5 text-xs text-brand-text-secondary">Double élimination — 2 vies par joueur, bracket dynamique.</p>
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FormField label="Nom du tournoi" id="edit_name" error={state?.errors?.name?.[0]}>
            <Input id="edit_name" name="name" type="text" required defaultValue={state?.fields?.name ?? tournament.name} />
          </FormField>
        </div>

        <FormField label="Date" id="edit_date" error={state?.errors?.date?.[0]}>
          <Input id="edit_date" name="date" type="date" required defaultValue={state?.fields?.date ?? tournament.date.split("T")[0]} />
        </FormField>

        <FormField label="Lieu" id="edit_location" error={state?.errors?.location?.[0]}>
          <Input id="edit_location" name="location" type="text" required defaultValue={state?.fields?.location ?? tournament.location} />
        </FormField>

        <FormField
          label="Joueurs max"
          id="edit_max_players"
          error={state?.errors?.max_players?.[0]}
          hint={hasEntitlement ? undefined : `Accès gratuit : jusqu'à ${FREE_TIER_MAX_PLAYERS} joueurs.`}
        >
          <Input
            id="edit_max_players"
            name="max_players"
            type="number"
            min="2"
            max={maxPlayersCap}
            required
            value={maxPlayers}
            onChange={(e) => handleMaxPlayersChange(e.target.value)}
          />
        </FormField>

        <FormField
          label="Droits d'inscription (€ / joueur)"
          id="edit_entry_fee"
          error={state?.errors?.entry_fee?.[0]}
        >
          <Input
            id="edit_entry_fee"
            name="entry_fee"
            type="number"
            min="0"
            required
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
          />
        </FormField>
      </div>

      {exceedsCapWithoutEntitlement && (
        <Alert tone="error">
          <p className="font-medium">
            Ce tournoi autorise {tournament.max_players} joueurs, au-delà de l&apos;accès gratuit
            ({FREE_TIER_MAX_PLAYERS}) — votre organisation n&apos;a ni abonnement actif ni crédit
            tournoi disponible.
          </p>
          <p className="mt-1">
            Réduisez le nombre de joueurs max à {FREE_TIER_MAX_PLAYERS} ou moins pour enregistrer
            d&apos;autres modifications, ou achetez un{" "}
            <a href={creditPurchaseUrl} target="_blank" rel="noreferrer" className="underline font-medium">
              crédit tournoi (4,90€)
            </a>{" "}
            ou un{" "}
            <a href={subscriptionUrl} target="_blank" rel="noreferrer" className="underline font-medium">
              abonnement DartsOpen (6,90€/mois ou 69€/an)
            </a>.
          </p>
        </Alert>
      )}
      {!hasEntitlement && !exceedsCapWithoutEntitlement && (
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
          <Card className="space-y-2">
            <p className="text-sm font-medium text-brand-dark">Mode de paiement</p>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="payment_mode" value="ONLINE" defaultChecked={(state?.fields?.payment_mode ?? tournament.payment_mode) === "ONLINE"} className="mt-0.5 accent-brand-turquoise" />
              <div>
                <p className="text-sm font-medium text-brand-dark">En ligne</p>
                <p className="text-xs text-brand-text-secondary">Les joueurs paient en ligne au moment de l&apos;inscription.</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="payment_mode" value="ONSITE" defaultChecked={(state?.fields?.payment_mode ?? tournament.payment_mode) === "ONSITE"} className="mt-0.5 accent-brand-turquoise" />
              <div>
                <p className="text-sm font-medium text-brand-dark">Sur place</p>
                <p className="text-xs text-brand-text-secondary">Les droits d&apos;inscription sont réglés le jour du tournoi.</p>
              </div>
            </label>
          </Card>
        ) : (
          <>
            {/* DO-STABILIZATION-001 (Problème 2) — même traitement qu'à la création : aucun
                faux choix, aucun bandeau anxiogène, ONLINE jamais conservé visuellement. */}
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
        {/* Nombre de poules : verrouillé à 1 en mode rapide */}
        {quickMode ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-text-secondary">Nombre de poules</label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-brand-text-secondary">
              <span>1</span>
              <span className="text-xs">(mode rapide)</span>
            </div>
            <input type="hidden" name="nb_pools" value="1" />
          </div>
        ) : (
          <FormField label="Nombre de poules" id="edit_nb_pools" error={state?.errors?.nb_pools?.[0]}>
            <Input id="edit_nb_pools" name="nb_pools" type="number" min="1" max="64" required defaultValue={state?.fields?.nb_pools ?? tournament.nb_pools} />
          </FormField>
        )}

        <FormField label="Nombre de cibles" id="edit_nb_boards" error={state?.errors?.nb_boards?.[0]}>
          <Input id="edit_nb_boards" name="nb_boards" type="number" min="1" max="32" required defaultValue={state?.fields?.nb_boards ?? tournament.nb_boards} />
        </FormField>

        <FormField label="Qualifiés par poule" id="edit_advancement_per_pool" error={state?.errors?.advancement_per_pool?.[0]}>
          <Input id="edit_advancement_per_pool" name="advancement_per_pool" type="number" min="1" max="8" required defaultValue={state?.fields?.advancement_per_pool ?? tournament.advancement_per_pool} />
        </FormField>

        {/* Joueurs par équipe : verrouillé à 1 en mode rapide */}
        {quickMode ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-text-secondary">Joueurs par équipe</label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-brand-text-secondary">
              <span>1</span>
              <span className="text-xs">(mode rapide)</span>
            </div>
            <input type="hidden" name="players_per_team" value="1" />
          </div>
        ) : (
          <FormField label="Joueurs par équipe" id="edit_players_per_team" error={state?.errors?.players_per_team?.[0]}>
            <Input id="edit_players_per_team" name="players_per_team" type="number" min="1" max="10" required defaultValue={state?.fields?.players_per_team ?? tournament.players_per_team} />
          </FormField>
        )}
      </div>

      <Card className="space-y-2">
        <p className="text-sm font-medium text-brand-dark">Mode d&apos;inscription</p>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="radio" name="registration_mode" value="ONLINE" defaultChecked={(state?.fields?.registration_mode ?? tournament.registration_mode) === "ONLINE"} className="mt-0.5 accent-brand-turquoise" />
          <div>
            <p className="text-sm font-medium text-brand-dark">En ligne</p>
            <p className="text-xs text-brand-text-secondary">Les joueurs s&apos;inscrivent depuis la page publique.</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="radio" name="registration_mode" value="ONSITE" defaultChecked={(state?.fields?.registration_mode ?? tournament.registration_mode) === "ONSITE"} className="mt-0.5 accent-brand-turquoise" />
          <div>
            <p className="text-sm font-medium text-brand-dark">Sur place uniquement</p>
            <p className="text-xs text-brand-text-secondary">Pas d&apos;inscription en ligne. Gestion manuelle uniquement.</p>
          </div>
        </label>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-medium text-brand-dark">Mode de saisie des scores</p>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="radio" name="scoring_mode" value="ELECTRONIC" defaultChecked={(state?.fields?.scoring_mode ?? tournament.scoring_mode) !== "TRADITIONAL"} className="mt-0.5 accent-brand-turquoise" />
          <div>
            <p className="text-sm font-medium text-brand-dark">Électronique</p>
            <p className="text-xs text-brand-text-secondary">Chaque équipe désigne le gagnant depuis son téléphone, l&apos;adversaire confirme.</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="radio" name="scoring_mode" value="TRADITIONAL" defaultChecked={(state?.fields?.scoring_mode ?? tournament.scoring_mode) === "TRADITIONAL"} className="mt-0.5 accent-brand-turquoise" />
          <div>
            <p className="text-sm font-medium text-brand-dark">Traditionnel</p>
            <p className="text-xs text-brand-text-secondary">Un marqueur saisit les scores volée par volée. Compte à rebours automatique.</p>
          </div>
        </label>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
      )}
    </div>
  );
}
