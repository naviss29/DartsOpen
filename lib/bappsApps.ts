/**
 * Adresses des autres applications BApps pour le sélecteur d'applications.
 *
 * Recette du 03/10/2026 : les liens étaient écrits en dur vers la production
 * (`https://eventmanager.bapps-studio.com`…) — depuis le site de test, on basculait sans le
 * savoir sur la vraie production. Même règle que BSsite (lib/catalog/products.ts) : seul
 * NEXT_PUBLIC_APP_URL (l'adresse de CETTE application, indispensable à la connexion SSO, donc
 * toujours renseignée) distingue staging et production ; NODE_ENV vaut "production" dans les deux.
 */

/** true si l'adresse est celle d'un site de test : `dev.bapps-studio.com` ou `*.dev.bapps-studio.com`. */
export function isStagingAppUrl(appUrl: string): boolean {
  if (!appUrl) return false;
  let host: string;
  try {
    host = new URL(appUrl).hostname;
  } catch {
    host = appUrl;
  }
  return host === "dev.bapps-studio.com" || host.endsWith(".dev.bapps-studio.com");
}

const IS_STAGING = isStagingAppUrl(process.env.NEXT_PUBLIC_APP_URL ?? "");

/**
 * Adresse de production d'une application BApps → son équivalent de test en staging
 * (`https://x.bapps-studio.com` → `https://x.dev.bapps-studio.com`, et le portail
 * `https://bapps-studio.com` → `https://dev.bapps-studio.com`). Inchangée en production.
 */
export function bappsAppUrl(prodUrl: string, staging: boolean = IS_STAGING): string {
  if (!staging) return prodUrl;
  try {
    const url = new URL(prodUrl);
    if (url.hostname === "bapps-studio.com") url.hostname = "dev.bapps-studio.com";
    else if (url.hostname.endsWith(".bapps-studio.com") && !url.hostname.endsWith(".dev.bapps-studio.com")) {
      url.hostname = url.hostname.replace(/\.bapps-studio\.com$/, ".dev.bapps-studio.com");
    }
    // URL ajoute un « / » final à une adresse sans chemin : on garde la forme d'origine.
    return prodUrl.endsWith("/") ? url.toString() : url.toString().replace(/\/$/, "");
  } catch {
    return prodUrl;
  }
}
