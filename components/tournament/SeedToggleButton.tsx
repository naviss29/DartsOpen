"use client";

import { useState, useTransition } from "react";
import { setSeedStatus } from "@/lib/actions/player";

interface Props {
  registrationId: string;
  tournamentId: string;
  seeded: boolean;
}

export function SeedToggleButton({ registrationId, tournamentId, seeded: initialSeeded }: Props) {
  const [seeded, setSeeded] = useState(initialSeeded);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !seeded;
    setSeeded(next);
    startTransition(async () => {
      const res = await setSeedStatus(registrationId, tournamentId, next);
      if (res?.error) setSeeded(!next);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={seeded ? "Retirer le statut tête de série" : "Définir comme tête de série"}
      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        seeded
          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          : "bg-slate-100 text-brand-text-secondary hover:bg-slate-200 hover:text-brand-dark"
      }`}
    >
      {seeded ? "★ Tête de série" : "☆"}
    </button>
  );
}
