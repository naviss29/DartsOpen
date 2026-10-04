import { prisma } from "./client";
import type { Prisma } from "../generated/prisma/client";

/**
 * Décision Product Owner (BAPPS-LEGAL-005 §9) : durée de conservation des coordonnées de
 * contact (email/téléphone) après la fin d'un tournoi. Le nom/pseudo et les résultats
 * sportifs, eux, sont conservés indéfiniment — c'est le classement inter-tournois, cœur du
 * produit. Valeur inchangée par RGPD-001 (seul le déclenchement a changé).
 */
export const CONTACT_RETENTION_MONTHS = 12;

/** Taille de page par défaut : nombre de tournois traités par lot (une requête de mise à jour par lot). */
export const DEFAULT_PURGE_BATCH_SIZE = 100;

/**
 * Seuil de conservation : un tournoi dont `date` est **strictement antérieure** à ce seuil
 * est expiré. Calcul identique à l'ancienne purge opportuniste (`setMonth` sur l'instant
 * courant) — RGPD-001 déplace le déclenchement, jamais la règle.
 */
export function computeContactRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - CONTACT_RETENTION_MONTHS);
  return cutoff;
}

/** Filtre des tournois concernés — partagé entre le comptage (dry-run) et l'écriture pour qu'ils ne divergent jamais. */
function expiredTournamentWhere(cutoff: Date): Prisma.TournamentWhereInput {
  return { status: "FINISHED", date: { lt: cutoff } };
}

/**
 * Filtre des inscriptions encore porteuses d'une coordonnée. C'est ce filtre qui rend la purge
 * idempotente : une inscription déjà purgée (`playerEmail = ""`, `playerPhone = null`) n'y
 * correspond plus, un second passage ne l'écrit donc jamais une deuxième fois.
 */
function registrationsWithContactWhere(tournamentIds: string[]): Prisma.RegistrationWhereInput {
  return {
    tournamentId: { in: tournamentIds },
    OR: [{ playerEmail: { not: "" } }, { playerPhone: { not: null } }],
  };
}

export type ContactPurgeReport = {
  cutoff: Date;
  dryRun: boolean;
  /** Tournois FINISHED expirés parcourus (qu'il leur reste ou non des coordonnées). */
  tournamentsScanned: number;
  batches: number;
  /** Inscriptions portant encore un email/téléphone au moment du passage. */
  registrationsEligible: number;
  /** Inscriptions réellement purgées (toujours 0 en dry-run). */
  registrationsPurged: number;
  /** Lots en échec — la purge continue sur les lots suivants, mais le script sort en erreur. */
  errors: number;
};

export type ContactPurgeOptions = {
  now?: Date;
  dryRun?: boolean;
  batchSize?: number;
  log?: (message: string) => void;
};

/**
 * Purge globale (tous organisateurs) des coordonnées de contact expirées — RGPD-001.
 *
 * Pourquoi un balayage global planifié plutôt que l'ancien déclenchement à la visite de
 * `/tournaments` : la purge ne s'appliquait qu'aux organisateurs qui revenaient sur leur
 * tableau de bord (un organisateur parti ne voyait jamais ses données purgées), et la
 * promesse non attendue pouvait être interrompue avec la requête.
 *
 * - Ne touche que `playerEmail`/`playerPhone` — jamais `playerName`, les résultats ni les
 *   champs de paiement.
 * - Paginée par curseur sur `Tournament.id` (ordre stable, aucun décalage si des lignes
 *   changent pendant le passage), un `updateMany` par lot : aucune transaction géante ni
 *   chargement de toutes les inscriptions en mémoire.
 * - Un lot en échec est journalisé et compté (`errors`), les suivants sont quand même traités :
 *   une ligne problématique ne doit jamais bloquer toute la conformité.
 * - `dryRun` : exécute uniquement des lectures (comptages), aucune écriture.
 */
export async function purgeExpiredContacts(options: ContactPurgeOptions = {}): Promise<ContactPurgeReport> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? DEFAULT_PURGE_BATCH_SIZE;
  const log = options.log ?? (() => {});

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`Taille de lot invalide (${batchSize}) : un entier strictement positif est attendu.`);
  }

  const cutoff = computeContactRetentionCutoff(now);
  const report: ContactPurgeReport = {
    cutoff,
    dryRun,
    tournamentsScanned: 0,
    batches: 0,
    registrationsEligible: 0,
    registrationsPurged: 0,
    errors: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    // La lecture de page n'est pas protégée par le try/catch par lot : sans elle le curseur ne
    // peut plus avancer, l'erreur remonte donc à l'appelant (script → code de sortie 1).
    const page = await prisma.tournament.findMany({
      where: expiredTournamentWhere(cutoff),
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;

    const ids = page.map((t) => t.id);
    cursor = ids[ids.length - 1];
    report.batches += 1;
    report.tournamentsScanned += ids.length;

    try {
      const where = registrationsWithContactWhere(ids);
      if (dryRun) {
        const eligible = await prisma.registration.count({ where });
        report.registrationsEligible += eligible;
      } else {
        // Pas de comptage préalable séparé en mode réel : le `count` renvoyé par `updateMany`
        // est exactement le nombre d'inscriptions qui portaient encore une coordonnée.
        const result = await prisma.registration.updateMany({
          where,
          data: { playerEmail: "", playerPhone: null },
        });
        report.registrationsEligible += result.count;
        report.registrationsPurged += result.count;
      }
    } catch (err) {
      report.errors += 1;
      log(
        `[purge-expired-contacts] Échec du lot ${report.batches} (${ids.length} tournoi(s), ` +
          `de ${ids[0]} à ${ids[ids.length - 1]}) : ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (page.length < batchSize) break;
  }

  return report;
}
