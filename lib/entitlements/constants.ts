/**
 * DARTSOPEN-MONETIZATION-001 — extrait de tournamentSizeGuard.ts pour rester importable depuis
 * un composant client (TournamentForm/EditTournamentForm) sans jamais tirer dedans le reste du
 * module serveur (dbGetOrganization → Prisma/pg, incompatible navigateur).
 */
export const FREE_TIER_MAX_PLAYERS = 10;
