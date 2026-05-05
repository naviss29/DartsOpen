"use client";

import { useTransition, useState } from "react";
import { createRegistration } from "@/lib/actions/stripe";

const inputCn =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

interface Props {
  tournamentId: string;
  isFree: boolean;
  playersPerTeam: number;
}

export function RegisterTeamForm({ tournamentId, isFree, playersPerTeam }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isTeam = playersPerTeam > 1;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const playerNames = Array.from({ length: playersPerTeam }, (_, i) =>
      (fd.get(`player_${i}`) as string).trim()
    );

    const teamName = isTeam
      ? (fd.get("team_name") as string)
      : playerNames[0];

    const phone = (fd.get("phone") as string).trim();
    if (phone && !/^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$/.test(phone)) {
      setError("Numéro de téléphone invalide (ex : 0612345678).");
      return;
    }

    startTransition(async () => {
      const result = await createRegistration(
        tournamentId,
        teamName,
        fd.get("contact_email") as string,
        phone || null,
        playerNames
      );
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isTeam && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Nom de l&apos;équipe *
          </label>
          <input
            name="team_name"
            type="text"
            required
            minLength={2}
            placeholder="Les Flèches d'Or"
            className={inputCn}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-300">
          {isTeam ? "Pseudos des joueurs *" : "Votre pseudo *"}
        </p>
        {Array.from({ length: playersPerTeam }, (_, i) => (
          <input
            key={i}
            name={`player_${i}`}
            type="text"
            required
            minLength={2}
            placeholder={isTeam ? `Joueur ${i + 1}` : "Votre pseudo"}
            className={inputCn}
          />
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Email de contact *
        </label>
        <input
          name="contact_email"
          type="email"
          required
          placeholder="capitaine@monequipe.fr"
          className={inputCn}
        />
        <p className="mt-1 text-xs text-gray-500">
          Utilisé uniquement pour les rappels et informations du tournoi.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Téléphone (optionnel)
        </label>
        <input
          name="phone"
          type="tel"
          placeholder="0612345678"
          pattern="^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$"
          className={inputCn}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending
          ? "Redirection…"
          : isFree
          ? "Confirmer l'inscription"
          : "Procéder au paiement →"}
      </button>
    </form>
  );
}
