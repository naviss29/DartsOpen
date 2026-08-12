/**
 * DARTSOPEN-MONETIZATION-002 (audit DO-AUD-008) — centralise les valeurs par défaut du
 * formulaire de création, en mode standard comme en mode rapide, pour ne plus jamais les
 * dupliquer à la main à plusieurs endroits (composants client, donc jamais d'import serveur ici
 * — voir lib/entitlements/constants.ts pour la même discipline côté palier gratuit).
 */
export const DEFAULT_MAX_PLAYERS = 16;
export const DEFAULT_NB_POOLS = 1;
export const DEFAULT_NB_BOARDS = 2;
