/**
 * Géométrie partagée entre BracketView (organisateur) et BracketLive (public) — les deux
 * rendaient le même calcul de positionnement/connecteurs SVG en double avant cette factorisation.
 * Purement dérivé des données (round/position), aucune logique métier.
 */
export const CARD_H = 72;
export const CARD_W = 220;
export const CONN_W = 48;
export const BASE_SLOT = CARD_H + 32;

interface RoundPositioned {
  bracket_round: number;
  bracket_position: number;
}

export function deriveR1Slots(matches: RoundPositioned[]): number {
  const maxR = Math.max(...matches.map((m) => m.bracket_round));
  for (let r = 1; r <= maxR; r++) {
    const rMatches = matches.filter((m) => m.bracket_round === r);
    if (rMatches.length === 0) continue;
    const maxPos = Math.max(...rMatches.map((m) => m.bracket_position));
    return (maxPos + 1) * Math.pow(2, r - 1);
  }
  return 0;
}

export function expectedCount(r1Slots: number, round: number): number {
  return Math.round(r1Slots / Math.pow(2, round - 1));
}

// Un "slot" a une carte si : R1 → match DB réel, R2+ → toujours (réel ou placeholder)
export function slotHasCard<M>(
  round: number,
  pos: number,
  roundMap: Map<number, M>,
  r1Slots: number,
): boolean {
  if (round === 1) return roundMap.has(pos);
  return pos < expectedCount(r1Slots, round);
}
