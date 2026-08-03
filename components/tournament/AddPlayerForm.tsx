"use client";

import { useActionState } from "react";
import { addPlayer } from "@/lib/actions/player";
import { Alert } from "@naviss29/design-system";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";
import Input from "@/components/ui/Input";

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
            <FormField label="Nom de l'équipe *" htmlFor="player_name" error={state?.errors?.player_name?.[0]}>
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
          <label htmlFor="player_pseudo_0" className="mb-1 block text-sm font-medium text-gray-700">
            {isTeam ? `Pseudos des joueurs *` : "Nom complet *"}
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
                placeholder={isTeam ? `Joueur ${i + 1}` : "Jean Dupont"}
              />
            ))}
          </div>
        </div>

        {!quickMode && (
          <>
            <FormField label="Email *" htmlFor="player_email" error={state?.errors?.player_email?.[0]}>
              <Input
                id="player_email"
                name="player_email"
                type="email"
                required
                defaultValue={state?.fields?.player_email}
                placeholder="jean@exemple.fr"
              />
            </FormField>

            <FormField label="Téléphone" htmlFor="player_phone" error={state?.errors?.player_phone?.[0]}>
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Inscription…" : isTeam ? "Inscrire l'équipe" : "Inscrire le joueur"}
      </Button>
    </form>
  );
}
