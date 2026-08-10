"use client";

import { useActionState } from "react";
import { addPlayer } from "@/lib/actions/player";
import { Alert, FormField, Input } from "@naviss29/design-system";
import Button from "@/components/ui/Button";

interface Props {
  tournamentId: string;
  playersPerTeam: number;
  quickMode?: boolean;
}

export function AddPlayerForm({ tournamentId, playersPerTeam, quickMode = false }: Props) {
  const [state, action, isPending] = useActionState(addPlayer, undefined);
  const isTeam = playersPerTeam > 1;

  return (
    <form key={state?.ts} action={action} className="space-y-4">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="players_per_team" value={playersPerTeam} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        {isTeam && (
          <div className="col-span-2">
            <FormField label="Nom de l'équipe *" id="player_name" error={state?.errors?.player_name?.[0]}>
              <Input
                id="player_name"
                name="player_name"
                type="text"
                required
                defaultValue={state?.fields?.player_name}
                placeholder="Les Flèches d'Or"
              />
            </FormField>
          </div>
        )}

        <div className={isTeam ? "col-span-2" : "col-span-1"}>
          <label htmlFor="player_pseudo_0" className="mb-1 block text-sm font-medium text-brand-dark">
            {isTeam ? `Pseudos des joueurs *` : "Pseudo *"}
          </label>
          <div className={isTeam ? "grid grid-cols-2 gap-2" : ""}>
            {Array.from({ length: playersPerTeam }, (_, i) => (
              <Input
                key={i}
                id={`player_pseudo_${i}`}
                name={`player_pseudo_${i}`}
                type="text"
                required
                minLength={2}
                defaultValue={state?.fields?.[`player_pseudo_${i}`]}
                placeholder={isTeam ? `Joueur ${i + 1}` : "Jean D. ou un pseudo"}
              />
            ))}
          </div>
        </div>

        {!quickMode && (
          <>
            <FormField label="Email *" id="player_email" error={state?.errors?.player_email?.[0]}>
              <Input
                id="player_email"
                name="player_email"
                type="email"
                required
                defaultValue={state?.fields?.player_email}
                placeholder="jean@exemple.fr"
              />
            </FormField>

            <FormField label="Téléphone" id="player_phone" error={state?.errors?.player_phone?.[0]}>
              <Input
                id="player_phone"
                name="player_phone"
                type="tel"
                defaultValue={state?.fields?.player_phone}
                placeholder="0612345678"
              />
            </FormField>
          </>
        )}
      </div>

      {!quickMode && (
        <p className="text-xs text-brand-text-secondary">
          Le pseudo et les résultats seront visibles publiquement sur les pages du tournoi et le
          classement DartsOpen. L&apos;email et le téléphone servent uniquement aux
          communications liées à ce tournoi et sont supprimés automatiquement 12 mois après
          l&apos;événement.
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Inscription…" : isTeam ? "Inscrire l'équipe" : "Inscrire le joueur"}
      </Button>
    </form>
  );
}
