"use client";

import { useState, useTransition } from "react";
import { updateRegistration } from "@/lib/actions/player";

const inputCn =
  "w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-turquoise";

interface Props {
  registrationId: string;
  tournamentId: string;
  playerName: string;
  playerEmail: string;
  playerPhone: string | null;
  playerNames: string[] | null;
  isTeam: boolean;
}

/**
 * Rectification (BAPPS-LEGAL-005 §7) — corrige une erreur sur les données
 * personnelles déclaratives d'une inscription. N'apparaît jamais pour un
 * résultat sportif : seuls nom/pseudo, email, téléphone et noms des
 * coéquipiers sont modifiables ici.
 */
export function EditPlayerButton({
  registrationId,
  tournamentId,
  playerName,
  playerEmail,
  playerPhone,
  playerNames,
  isTeam,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(playerName);
  const [email, setEmail] = useState(playerEmail);
  const [phone, setPhone] = useState(playerPhone ?? "");
  const [names, setNames] = useState((playerNames ?? []).join(", "));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-turquoise hover:text-brand-turquoise/80 transition-colors"
      >
        Modifier
      </button>
    );
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateRegistration(registrationId, tournamentId, {
        playerName: name,
        playerEmail: email,
        playerPhone: phone,
        playerNames: isTeam ? names.split(",") : [],
      });
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-1 py-2 min-w-[180px]">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputCn}
        placeholder={isTeam ? "Nom de l'équipe" : "Pseudo"}
      />
      {isTeam && (
        <input
          value={names}
          onChange={(e) => setNames(e.target.value)}
          className={inputCn}
          placeholder="Pseudos des joueurs, séparés par des virgules"
        />
      )}
      <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCn} placeholder="Email" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCn} placeholder="Téléphone" />
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="text-xs font-medium text-brand-turquoise hover:text-brand-turquoise/80 disabled:opacity-50"
        >
          {isPending ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="text-xs text-brand-text-secondary hover:text-brand-dark disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
