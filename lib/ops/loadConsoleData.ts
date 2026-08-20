import { dbListRegistrations, dbListPools, dbListMatches } from "@/lib/db/tournament";
import { dbListFieldIncidents } from "@/lib/db/fieldIncident";

/**
 * DO-OPS-002 — défaut 2 : DO-OPS-001 rattrapait chaque échec de lecture par un `.catch(() => [])`
 * séparé, transformant silencieusement une panne DB en état métier "zéro élément" — sur un poste
 * de conduite jour J, une synthèse calculée sur un `[]` mensonger (progression à 0, mauvaise
 * prochaine action, cibles données comme libres) est pire qu'une page en erreur. Cette fonction
 * ne rattrape plus rien : une erreur sur l'une des trois lectures critiques (inscriptions, poules,
 * matchs) est journalisée puis **propagée** telle quelle, pour que app/(dashboard)/tournaments/
 * [id]/pilotage/error.tsx (déjà en place depuis DO-OPS-001) prenne le relais avec un vrai état
 * d'erreur, jamais une console qui ment sur l'état réel du tournoi.
 */
export async function loadTournamentConsoleData(tournamentId: string) {
  try {
    const [registrations, pools, matches, fieldIncidents] = await Promise.all([
      dbListRegistrations(tournamentId),
      dbListPools(tournamentId),
      dbListMatches(tournamentId),
      dbListFieldIncidents(tournamentId),
    ]);
    return { registrations, pools, matches, fieldIncidents };
  } catch (err) {
    console.error("[loadTournamentConsoleData]", err);
    throw err;
  }
}
