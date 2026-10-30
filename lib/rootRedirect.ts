import { bappsAppUrl } from "@/lib/bappsApps";

/**
 * Destination de la racine « / » (recette pré-lancement, 28/10/2026).
 *
 * Avant : « / » envoyait toujours vers /dashboard, donc un visiteur arrivé par
 * dartsopen.bapps-studio.com tombait directement sur l'écran de connexion sans savoir ce qu'est
 * DartsOpen. Désormais : session présente → tableau de bord (comportement inchangé pour les
 * organisateurs) ; aucune session → page de présentation du produit sur la vitrine BApps Studio.
 *
 * La base de la vitrine vient de NEXT_PUBLIC_BSSITE_URL (déjà utilisée pour le portail), avec le
 * même repli que le reste de l'application (bappsAppUrl → dev.bapps-studio.com en staging),
 * jamais une adresse de production codée en dur.
 */
export const PRODUCT_PAGE_PATH = "/produits/dartsopen";

export function vitrineBaseUrl(envValue: string | undefined = process.env.NEXT_PUBLIC_BSSITE_URL): string {
  const base = envValue?.trim() || bappsAppUrl("https://bapps-studio.com");
  return base.replace(/\/+$/, "");
}

export function rootRedirectTarget(hasSession: boolean, baseUrl: string = vitrineBaseUrl()): string {
  return hasSession ? "/dashboard" : `${baseUrl}${PRODUCT_PAGE_PATH}`;
}
