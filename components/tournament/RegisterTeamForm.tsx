"use client";

import { useTransition, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createRegistration } from "@/lib/actions/registration";

const inputCn =
  "w-full rounded-lg border border-border-default px-3 py-2 text-sm text-brand-dark placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:border-transparent transition-shadow";

interface Props {
  tournamentId: string;
  /**
   * True quand l'inscription se confirme immédiatement, sans redirection Stripe — un tournoi
   * gratuit, ou un tournoi payant en payment_mode ONSITE (droits réglés sur place, indépendant
   * de entry_fee — DARTSOPEN-MONETIZATION-001, mission §5/§6). Seul entry_fee > 0 ET
   * payment_mode === "ONLINE" déclenche jamais une redirection de paiement.
   */
  confirmsImmediately: boolean;
  playersPerTeam: number;
}

export function RegisterTeamForm({ tournamentId, confirmsImmediately, playersPerTeam }: Props) {
  const { t } = useI18n();
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
      setError(t("register.invalidPhone"));
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
        <div className="rounded-lg bg-danger-subtle border border-danger-border p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {isTeam && (
        <div>
          <label htmlFor="team_name" className="block text-sm font-medium text-brand-dark mb-1">
            {t("register.teamName")}
          </label>
          <input
            id="team_name"
            name="team_name"
            type="text"
            required
            minLength={2}
            placeholder={t("register.teamPlaceholder")}
            className={inputCn}
          />
        </div>
      )}

      <div className="space-y-3">
        <label htmlFor="player_0" className="block text-sm font-medium text-brand-dark">
          {isTeam ? t("register.players") : t("register.nickname")}
        </label>
        {Array.from({ length: playersPerTeam }, (_, i) => (
          <input
            key={i}
            id={`player_${i}`}
            name={`player_${i}`}
            type="text"
            required
            minLength={2}
            placeholder={isTeam ? t("register.playerPlaceholder", { number: i + 1 }) : t("register.nicknamePlaceholder")}
            className={inputCn}
          />
        ))}
      </div>

      <div>
        <label htmlFor="contact_email" className="block text-sm font-medium text-brand-dark mb-1">
          {t("register.email")}
        </label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          required
          placeholder="contact@example.com"
          className={inputCn}
        />
        <p className="mt-1 text-xs text-brand-text-secondary">
          {t("register.emailHint")}
        </p>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-brand-dark mb-1">
          {t("register.phone")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          placeholder="0612345678"
          pattern="^(?:0[1-9]|\+33\s?[1-9])([\s.\-]?\d{2}){4}$"
          className={inputCn}
        />
      </div>

      <p className="text-xs text-brand-text-secondary">
        {t("register.privacy")}{" "}
        <a href="/confidentialite" className="underline hover:text-brand-dark" target="_blank" rel="noreferrer">
          {t("register.privacyLink")}
        </a>
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-turquoise px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-turquoise/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending
          ? t("register.redirecting")
          : confirmsImmediately
          ? t("register.confirm")
          : t("register.pay")}
      </button>
    </form>
  );
}
