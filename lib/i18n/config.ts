import { catalogs, type Locale } from "./catalogs";

export type { Locale } from "./catalogs";
export const defaultLocale: Locale = "fr";
export const localeCookieName = "bapps_locale_shared";
export const legacyLocaleCookieName = "bapps_locale";
export const supportedLocales = Object.keys(catalogs) as Locale[];

export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
};

export const localeTags: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

export const openGraphLocales: Record<Locale, string> = {
  fr: "fr_FR",
  en: "en_GB",
  es: "es_ES",
};

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type PluralForms = { other: string } & Partial<Record<PluralCategory, string>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocales.includes(value as Locale);
}

export function resolveLocalePreference(shared: unknown, legacy: unknown): Locale {
  if (isLocale(shared)) return shared;
  return isLocale(legacy) ? legacy : defaultLocale;
}

export function selectPlural(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(localeTags[locale]).select(count);
  const template = forms[category] ?? forms.other;
  const localizedCount = new Intl.NumberFormat(localeTags[locale]).format(count);
  return template.replaceAll("{count}", localizedCount);
}
