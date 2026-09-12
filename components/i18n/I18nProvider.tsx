"use client";

import { createContext, useContext, type ReactNode } from "react";
import { catalogs, translate, type Locale, type MessageKey, type Messages } from "@/lib/i18n/catalogs";
import {
  defaultLocale,
  localeTags,
  selectPlural,
  type PluralForms,
} from "@/lib/i18n/config";

interface I18nValue {
  locale: Locale;
  messages: Messages;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  plural: (count: number, forms: PluralForms) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
}

function buildValue(locale: Locale, messages: Messages): I18nValue {
  return {
    locale,
    messages,
    t: (key, values) => translate(messages, key, values),
    plural: (count, forms) => selectPlural(locale, count, forms),
    formatNumber: (value, options) => new Intl.NumberFormat(localeTags[locale], options).format(value),
    formatCurrency: (value, currency = "EUR") =>
      new Intl.NumberFormat(localeTags[locale], { style: "currency", currency }).format(value),
    formatDate: (value, options) =>
      new Intl.DateTimeFormat(localeTags[locale], options).format(new Date(value)),
  };
}

const I18nContext = createContext<I18nValue>(buildValue(defaultLocale, catalogs[defaultLocale]));

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return <I18nContext.Provider value={buildValue(locale, messages)}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
