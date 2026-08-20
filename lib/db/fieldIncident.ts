import { prisma } from "./client";
import { Prisma } from "../generated/prisma/client";
import type { FieldIncidentType, FieldIncidentReporterRole } from "../generated/prisma/client";

/**
 * DO-FIELD-INCIDENT-001 — CRUD léger de signalement terrain. Cette table ne fait que TRACER un
 * incident et son origine ; toute résolution sportive (forfait, arbitrage) passe par les
 * primitives dédiées (dbDeclareForfeit dans lib/db/tournament.ts, dbArbitrateMatch existant),
 * jamais recalculée ici — voir le docblock du modèle FieldIncident, prisma/schema.prisma.
 */

const MAX_COMMENT_LENGTH = 280;

/**
 * Même discipline que isIdempotencyKeyConflict (lib/db/tournament.ts) : le moteur de requête
 * signale une contrainte Postgres non modélisée dans le schéma Prisma (index partiel manuscrit)
 * via `driverAdapterError.cause.constraint.fields` (tableau de colonnes), jamais un `target`
 * ni un `constraint.name` exploitable — vérifié empiriquement contre le vrai driver.
 */
function isDuplicateOpenIncidentConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const meta = err.meta as
    | { target?: string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } }
    | undefined;
  const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
  return fields.includes("match_id") && fields.includes("type");
}

/**
 * Crée un incident OPEN. Dédoublonnage réel (pas seulement applicatif) via l'index unique
 * partiel `field_incidents_open_dedup` (match_id, type) WHERE status = 'OPEN' — un double-clic
 * ou un retry réseau qui déclenche deux INSERT concurrents pour le même (match, type) voit le
 * second échouer avec une violation de contrainte, rattrapée ici pour renvoyer l'incident déjà
 * ouvert plutôt qu'une erreur brute.
 */
export async function dbCreateFieldIncident(
  tournamentId: string,
  matchId: string,
  type: FieldIncidentType,
  reportedBy: FieldIncidentReporterRole,
  comment?: string | null,
): Promise<{ error?: string; incidentId?: string }> {
  const trimmedComment = comment?.trim().slice(0, MAX_COMMENT_LENGTH) || null;

  try {
    const incident = await prisma.fieldIncident.create({
      data: { tournamentId, matchId, type, reportedBy, comment: trimmedComment },
      select: { id: true },
    });
    return { incidentId: incident.id };
  } catch (err) {
    if (isDuplicateOpenIncidentConflict(err)) {
      const existing = await prisma.fieldIncident.findFirst({
        where: { matchId, type, status: "OPEN" },
        select: { id: true },
      });
      if (existing) return { incidentId: existing.id };
    }
    throw err;
  }
}

/**
 * Auto-résolution paresseuse : un incident sportif (PLAYER_ABSENT/RESULT_DISPUTED) encore OPEN
 * dont le match a désormais un vainqueur réel (forfait déclaré, arbitrage organisateur, ou tout
 * autre mécanisme sportif existant ayant tranché entre-temps) est marqué RESOLVED — jamais
 * l'inverse : un incident sportif n'est RESOLVED qu'après le succès réel de l'opération
 * correspondante, quel que soit le chemin qui l'a produite. Appelée avant chaque lecture pour
 * que Pilotage ne montre jamais un incident déjà réglé par un autre canal (ex. l'organisateur a
 * utilisé l'arbitrage existant directement depuis Poules/Bracket sans repasser par l'incident).
 */
async function autoResolveSportiveIncidents(tournamentId: string): Promise<void> {
  await prisma.fieldIncident.updateMany({
    where: {
      tournamentId,
      status: "OPEN",
      type: { in: ["PLAYER_ABSENT", "RESULT_DISPUTED"] },
      match: { winnerId: { not: null } },
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

export type FieldIncidentListItem = {
  id: string;
  type: FieldIncidentType;
  status: "OPEN" | "RESOLVED";
  reported_by: FieldIncidentReporterRole;
  comment: string | null;
  created_at: string;
  resolved_at: string | null;
  match_id: string;
  board_number: number;
  pool_id: string | null;
  bracket_round: number | null;
  player1_id: string;
  player1_name: string;
  player2_id: string | null;
  player2_name: string | null;
};

/** Lecture pour Pilotage — journalise puis laisse toute erreur inattendue se propager (jamais un `[]` mensonger), même discipline que loadTournamentConsoleData(). */
export async function dbListFieldIncidents(tournamentId: string): Promise<FieldIncidentListItem[]> {
  await autoResolveSportiveIncidents(tournamentId);

  const rows = await prisma.fieldIncident.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "desc" },
    include: {
      match: {
        select: {
          id: true,
          boardNumber: true,
          poolId: true,
          bracketRound: true,
          player1Id: true,
          player2Id: true,
          player1: { select: { playerName: true } },
          player2: { select: { playerName: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    reported_by: r.reportedBy,
    comment: r.comment,
    created_at: r.createdAt.toISOString(),
    resolved_at: r.resolvedAt?.toISOString() ?? null,
    match_id: r.match.id,
    board_number: r.match.boardNumber,
    pool_id: r.match.poolId,
    bracket_round: r.match.bracketRound,
    player1_id: r.match.player1Id,
    player1_name: r.match.player1.playerName,
    player2_id: r.match.player2Id,
    player2_name: r.match.player2?.playerName ?? null,
  }));
}

/**
 * Résolution manuelle — réservée au type OTHER (voir resolveOtherIncident, lib/actions/
 * fieldIncident.ts, pour la garde d'autorisation). `matchId` est revérifié ici (pas seulement
 * dans l'action appelante) : un arbitre n'a une session terrain valide QUE pour son match — sans
 * ce contrôle, l'identifiant d'incident seul ne suffirait pas à l'empêcher de cibler un incident
 * d'un autre match. Idempotente.
 */
export async function dbResolveOtherIncident(tournamentId: string, matchId: string, incidentId: string): Promise<{ error?: string }> {
  const incident = await prisma.fieldIncident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.tournamentId !== tournamentId || incident.matchId !== matchId) {
    return { error: "Incident introuvable." };
  }
  if (incident.type !== "OTHER") {
    return { error: "Ce type d'incident nécessite l'action sportive correspondante, pas une simple résolution manuelle." };
  }
  if (incident.status === "RESOLVED") return {};

  await prisma.fieldIncident.update({
    where: { id: incidentId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return {};
}
