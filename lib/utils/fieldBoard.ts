/**
 * DO-FIELD-ACCESS-002 — parsing strict du numéro de cible, en remplacement d'un `parseInt()` nu
 * qui acceptait silencieusement `"1abc"` (`parseInt` s'arrête au premier caractère non
 * numérique sans jamais échouer). Une chaîne entière positive, sans zéro non significatif, est
 * seule acceptée : `"1abc"`, `"1.5"`, `"-1"`, `"0"`, `""` sont toutes refusées explicitement
 * plutôt que silencieusement tronquées/arrondies.
 *
 * `"01"` est délibérément refusé (zéro non significatif) : un board imprimé sur un QR ne l'est
 * jamais avec un zéro de tête, donc une telle valeur ne peut être qu'une manipulation manuelle
 * de l'URL — décision technique, pas une contrainte imposée par le produit.
 *
 * `maxBoards`, quand disponible (nombre de cibles réellement configurées pour CE tournoi), est
 * la borne préférée. À défaut, `ABSOLUTE_MAX` reste un garde-fou de bon sens contre une valeur
 * numériquement valide mais manifestement absurde.
 */
const STRICT_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const ABSOLUTE_MAX = 500;

export function parseBoardNumber(raw: string | null | undefined, maxBoards?: number): number | null {
  if (!raw) return null;
  if (!STRICT_POSITIVE_INTEGER.test(raw)) return null;

  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;

  const upperBound = maxBoards !== undefined && maxBoards > 0 ? maxBoards : ABSOLUTE_MAX;
  if (n > upperBound) return null;

  return n;
}
