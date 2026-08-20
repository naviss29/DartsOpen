"use server";

import { revalidatePath } from "next/cache";
import { dbCreateFieldIncident, dbResolveOtherIncident } from "@/lib/db/fieldIncident";
import { dbDeclareForfeit } from "@/lib/db/tournament";
import { authorizeScoring, type ScoringAuthorization } from "@/lib/actions/fieldAccess";
import { doAdvanceToNextRound } from "@/lib/actions/bracket";
import { publishMatchUpdate } from "@/lib/mercure";
import type { FieldIncidentType, FieldIncidentReporterRole } from "@/lib/generated/prisma/client";

/**
 * DO-FIELD-INCIDENT-001 — mécanisme unique de signalement/traitement des incidents terrain
 * (joueur absent, résultat contesté, autre), intégré au modèle d'autorisation déjà établi par
 * DO-FIELD-ACCESS (authorizeScoring : organisateur OU session terrain PLAYER/REFEREE liée
 * strictement au match). Jamais un système de tickets générique, jamais de messagerie.
 */

const REPORTABLE_TYPES: readonly FieldIncidentType[] = ["PLAYER_ABSENT", "RESULT_DISPUTED", "OTHER"];
const MAX_COMMENT_LENGTH = 280;

function reporterRoleFor(access: ScoringAuthorization & { ok: true }): FieldIncidentReporterRole {
  return access.actor === "ORGANIZER" ? "ORGANIZER" : access.role;
}

/**
 * Étape 3 — "Appeler l'organisation" : ouvert aux trois profils (PLAYER/REFEREE/ORGANIZER), ne
 * modifie JAMAIS un résultat sportif — crée uniquement un incident OPEN. Le dédoublonnage réel
 * (double-clic/retry) est garanti par l'index unique partiel côté base, pas seulement ici — voir
 * dbCreateFieldIncident.
 */
export async function reportFieldIncident(
  tournamentId: string,
  matchId: string,
  type: FieldIncidentType,
  comment?: string,
): Promise<{ error?: string; incidentId?: string }> {
  if (!REPORTABLE_TYPES.includes(type)) return { error: "Type de signalement invalide." };

  const access = await authorizeScoring(tournamentId, matchId);
  if (!access.ok) return { error: access.error };

  const trimmedComment = comment?.trim().slice(0, MAX_COMMENT_LENGTH) || undefined;

  const result = await dbCreateFieldIncident(tournamentId, matchId, type, reporterRoleFor(access), trimmedComment).catch(
    (): Awaited<ReturnType<typeof dbCreateFieldIncident>> => ({ error: "Erreur lors du signalement." }),
  );
  if (result.error) return { error: result.error };

  publishMatchUpdate(tournamentId).catch(() => {});
  revalidatePath(`/tournaments/${tournamentId}/pilotage`);
  return { incidentId: result.incidentId };
}

/**
 * Étape 4 Cas A / Étape 5 — déclare le forfait d'un joueur du match. Réservé à l'arbitre de CE
 * match (session terrain REFEREE, autorité limitée à son match par construction — authorizeScoring
 * ne délivre jamais un rôle REFEREE pour un autre match) et à l'organisateur. Un PLAYER ne peut
 * jamais atteindre cette action avec succès : authorizeScoring lui accorderait au mieux
 * `actor: "FIELD", role: "PLAYER"`, explicitement exclu ci-dessous.
 */
export async function declareForfeit(
  tournamentId: string,
  matchId: string,
  absentPlayerId: string,
): Promise<{ error?: string }> {
  const access = await authorizeScoring(tournamentId, matchId);
  if (!access.ok) return { error: access.error };
  if (access.actor !== "ORGANIZER" && access.role !== "REFEREE") {
    return { error: "Cette action nécessite un accès organisateur ou arbitre." };
  }

  const result = await dbDeclareForfeit(tournamentId, matchId, absentPlayerId).catch(
    (): Awaited<ReturnType<typeof dbDeclareForfeit>> => ({ error: "Erreur lors de la déclaration de forfait." }),
  );
  if (result.error) return { error: result.error };

  if (result.matchFinished && result.match?.bracketRound !== null && result.match?.bracketRound !== undefined && !result.match.quickMode) {
    await doAdvanceToNextRound(tournamentId, result.match.bracketRound).catch(() => null);
  }

  if (result.matchFinished) {
    publishMatchUpdate(tournamentId).catch(() => {});
  }

  revalidatePath(`/tournaments/${tournamentId}/pilotage`);
  revalidatePath(`/t/${tournamentId}/score`);
  revalidatePath(`/t/${tournamentId}/live`);
  return {};
}

/**
 * Étape 5 — résolution manuelle d'un incident OTHER (aucune mutation sportive). Même restriction
 * d'accès que declareForfeit : organisateur ou arbitre de CE match précis.
 */
export async function resolveOtherIncident(
  tournamentId: string,
  matchId: string,
  incidentId: string,
): Promise<{ error?: string }> {
  const access = await authorizeScoring(tournamentId, matchId);
  if (!access.ok) return { error: access.error };
  if (access.actor !== "ORGANIZER" && access.role !== "REFEREE") {
    return { error: "Cette action nécessite un accès organisateur ou arbitre." };
  }

  const result = await dbResolveOtherIncident(tournamentId, matchId, incidentId).catch(
    (): Awaited<ReturnType<typeof dbResolveOtherIncident>> => ({ error: "Erreur lors de la résolution de l'incident." }),
  );
  if (result.error) return { error: result.error };

  revalidatePath(`/tournaments/${tournamentId}/pilotage`);
  return {};
}
