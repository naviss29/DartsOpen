const fr = {
  "language.label": "Langue",
  "language.updateError": "Impossible de changer la langue.",
  "metadata.title": "DartsOpen — Gestion de tournois de fléchettes",
  "metadata.description": "Plateforme SaaS de gestion de tournois de fléchettes : inscriptions en ligne, scores en temps réel, tableaux de bord sur smartphone. Un produit BApps Studio.",
  "footer.legal": "Mentions légales",
  "footer.privacy": "Confidentialité",
  "footer.terms": "CGU",
  "nav.dashboard": "Tableau de bord",
  "nav.tournaments": "Mes tournois",
  "nav.settings": "Paramètres",
  "nav.navigation": "Navigation",
  "nav.openMenu": "Ouvrir le menu",
  "nav.closeMenu": "Fermer le menu",
  "nav.close": "Fermer",
} as const;

export type MessageKey = keyof typeof fr;
export type Messages = Record<MessageKey, string>;

const en = {
  "language.label": "Language",
  "language.updateError": "Unable to change the language.",
  "metadata.title": "DartsOpen — Darts tournament management",
  "metadata.description": "SaaS platform for darts tournaments: online registration, real-time scoring and smartphone dashboards. A BApps Studio product.",
  "footer.legal": "Legal notice",
  "footer.privacy": "Privacy",
  "footer.terms": "Terms of use",
  "nav.dashboard": "Dashboard",
  "nav.tournaments": "My tournaments",
  "nav.settings": "Settings",
  "nav.navigation": "Navigation",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "nav.close": "Close",
} satisfies Messages;

const es = {
  "language.label": "Idioma",
  "language.updateError": "No se ha podido cambiar el idioma.",
  "metadata.title": "DartsOpen — Gestión de torneos de dardos",
  "metadata.description": "Plataforma SaaS para torneos de dardos: inscripciones en línea, resultados en tiempo real y paneles para smartphone. Un producto BApps Studio.",
  "footer.legal": "Aviso legal",
  "footer.privacy": "Privacidad",
  "footer.terms": "Condiciones de uso",
  "nav.dashboard": "Panel de control",
  "nav.tournaments": "Mis torneos",
  "nav.settings": "Ajustes",
  "nav.navigation": "Navegación",
  "nav.openMenu": "Abrir el menú",
  "nav.closeMenu": "Cerrar el menú",
  "nav.close": "Cerrar",
} satisfies Messages;

export const catalogs = { fr, en, es } satisfies Record<string, Messages>;
export type Locale = keyof typeof catalogs;

export function translate(messages: Messages, key: MessageKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    messages[key],
  );
}
