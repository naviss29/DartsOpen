/**
 * Base des redirections émises par les route handlers : l'adresse PUBLIQUE de DartsOpen.
 *
 * Derrière le proxy (production/staging Coolify), `request.url` d'un route handler vaut
 * l'adresse interne du conteneur (`https://localhost:3000/...`) : le QR code d'une cible
 * renvoyait le joueur vers localhost au lieu de la page de saisie (constaté le 05/10/2026,
 * production comprise). `request.url` ne reste qu'un repli quand la variable manque
 * (développement local, où les deux coïncident).
 */
export function publicBaseUrl(requestUrl: string): string {
  return process.env.NEXT_PUBLIC_APP_URL || requestUrl;
}
