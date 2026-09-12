import { cache } from "react";
import { cookies } from "next/headers";
import { catalogs, translate, type Locale, type MessageKey } from "./catalogs";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  localeTags,
  selectPlural,
  type PluralForms,
} from "./config";

async function resolveRequestLocale(overrideLocale?: Locale): Promise<Locale> {
  if (overrideLocale) return overrideLocale;

  try {
    const store = await cookies();
    const requestedLocale = store.get(localeCookieName)?.value;
    return isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  } catch {
    // Les composants peuvent être rendus hors requête pendant un test unitaire ou un build
    // statique. Le français reste alors le repli déterministe.
    return defaultLocale;
  }
}

export const getI18n = cache(async (overrideLocale?: Locale) => {
  const locale = await resolveRequestLocale(overrideLocale);
  const messages = catalogs[locale];

  return {
    locale,
    messages,
    t: (key: MessageKey, values?: Record<string, string | number>) => translate(messages, key, values),
    plural: (count: number, forms: PluralForms) => selectPlural(locale, count, forms),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(localeTags[locale], options).format(value),
    formatCurrency: (value: number, currency = "EUR") =>
      new Intl.NumberFormat(localeTags[locale], { style: "currency", currency }).format(value),
    formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(localeTags[locale], options).format(new Date(value)),
  };
});
