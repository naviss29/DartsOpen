/**
 * Fenêtre d'inscription en ligne selon la date du tournoi (recette pré-lancement, 28/10/2026).
 *
 * Constat : un tournoi resté au statut OPEN après sa date (organisateur qui ne l'a ni démarré ni
 * clôturé) acceptait encore des inscriptions, y compris payantes. On ne touche ni au statut ni
 * aux données : l'inscription est simplement refusée dès le lendemain de la date du tournoi.
 *
 * `Tournament.date` est une date sans heure (`@db.Date`) : le jour J reste ouvert (inscriptions
 * de dernière minute avant le début), la journée de référence est celle de Paris — le produit
 * vise des tournois en France, un serveur en UTC ne doit pas fermer les inscriptions à 1 h du matin.
 */
const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour calendaire (AAAA-MM-JJ) d'une date de tournoi stockée en `@db.Date` (minuit UTC). */
function tournamentDay(date: Date | string): string | null {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/** true quand la date du tournoi est strictement antérieure au jour courant à Paris. */
export function isTournamentDatePast(date: Date | string, now: Date = new Date()): boolean {
  const day = tournamentDay(date);
  // Date illisible : on ne bloque pas (le statut OPEN reste la règle), l'anomalie est journalisée.
  if (!day) {
    console.error("[isTournamentDatePast] Date de tournoi illisible :", date);
    return false;
  }
  return day < PARIS_DAY.format(now);
}
