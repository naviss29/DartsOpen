"use client";

import { useTransition, useState } from "react";
import { createRegistration } from "@/lib/actions/stripe";

const inputCn =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

interface Props {
  tournamentId: string;
  isFree: boolean;
}

export function RegisterTeamForm({ tournamentId, isFree }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createRegistration(
        tournamentId,
        fd.get("team_name") as string,
        fd.get("contact_email") as string,
        (fd.get("phone") as string) || null
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
          placeholder="06 00 00 00 00"
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
