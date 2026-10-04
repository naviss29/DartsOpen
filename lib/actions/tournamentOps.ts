"use server";

import { revalidatePath } from "next/cache";
import { requireTournamentManager } from "@/lib/auth/organizationAccess";
import { withTournamentLock, dbPromoteUnassignedMatches } from "@/lib/db/tournament";

/**
 * DO-OPS-001 — expose, depuis la console jour J, l'affectation automatique des cibles libres
 * déjà utilisée en interne par le moteur sportif (dbPromoteUnassignedMatches(), appelée jusqu'ici
 * uniquement depuis doAdvanceToNextRoundTx()/doAdvanceQuickTournamentTx() après la fin d'un
 * match). Aucune nouvelle règle d'affectation : ce Server Action ne fait qu'ouvrir manuellement
 * la même fonction, sous le même verrou tournoi, pour l'incident "cible libre alors que des
 * matchs attendent" (lib/ops/tournamentConsole.ts::detectIncidents) — jamais un second moteur.
 */
export async function reassignFreeBoards(tournamentId: string): Promise<{ error?: string }> {
  const guard = await requireTournamentManager(tournamentId);
  if (!guard.ok) return { error: guard.error };
  const tournament = guard.tournament;

  await withTournamentLock(tournamentId, (tx) => dbPromoteUnassignedMatches(tx, tournamentId, tournament.nb_boards));

  revalidatePath(`/tournaments/${tournamentId}/console`);
  revalidatePath(`/tournaments/${tournamentId}/pools`);
  return {};
}
