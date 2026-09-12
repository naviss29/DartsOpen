"use client";

import { useState } from "react";
import { localeLabels, supportedLocales, type Locale } from "@/lib/i18n/config";
import { useI18n } from "./I18nProvider";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function changeLocale(nextLocale: Locale) {
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });

      if (!response.ok) throw new Error("locale_update_failed");
      window.location.reload();
    } catch {
      setError(t("language.updateError"));
      setIsSaving(false);
    }
  }

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <label className="sr-only" htmlFor="bapps-language">
        {t("language.label")}
      </label>
      <select
        id="bapps-language"
        value={locale}
        disabled={isSaving}
        onChange={(event) => void changeLocale(event.target.value as Locale)}
        className="rounded-md border border-current/30 bg-transparent px-2 py-1 text-sm"
        aria-describedby={error ? "bapps-language-error" : undefined}
      >
        {supportedLocales.map((candidate) => (
          <option key={candidate} value={candidate} className="text-brand-dark">
            {localeLabels[candidate]}
          </option>
        ))}
      </select>
      {error && (
        <span id="bapps-language-error" role="alert" className="mt-1 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
