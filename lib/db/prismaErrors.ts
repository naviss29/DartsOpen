import { Prisma } from "../generated/prisma/client";

/**
 * Audit pré-recette (2026-09) — la forme exacte d'une erreur P2002 sur un index Postgres
 * manuscrit (hors modèle Prisma) a changé entre prisma@7.8.0 et prisma@7.10.0 : elle exposait
 * `meta.driverAdapterError.cause.constraint.fields` (tableau de colonnes), elle expose
 * désormais `meta.driverAdapterError.cause.constraint.index` (le nom de l'index) — confirmé
 * empiriquement (voir `lib/db/fieldIncident.concurrency.test.ts`, qui a détecté la régression
 * silencieuse lors de la montée de version). `isDuplicateOpenIncidentConflict`,
 * `isIdempotencyKeyConflict` et `isSportEngineUniqueConflict` s'appuyaient chacune sur leur
 * propre lecture partielle de cette forme, déjà documentée comme instable d'une version à
 * l'autre — centralisé ici pour n'avoir qu'un seul endroit à corriger la prochaine fois que le
 * moteur de requête change de forme, plutôt que trois.
 *
 * Retourne tous les identifiants de contrainte trouvables dans l'erreur (noms de colonnes,
 * nom d'index, nom de contrainte), quelle que soit la forme utilisée par la version de Prisma
 * en place — jamais une seule forme supposée stable.
 */
export function p2002ConstraintIdentifiers(err: unknown): string[] {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return [];
  }
  const meta = err.meta as
    | {
        target?: string | string[];
        driverAdapterError?: {
          cause?: { constraint?: { fields?: string[]; index?: string; name?: string } };
        };
      }
    | undefined;

  const ids: string[] = [];
  if (meta?.target) {
    ids.push(...(Array.isArray(meta.target) ? meta.target : [meta.target]));
  }
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  if (constraint?.fields) ids.push(...constraint.fields);
  if (constraint?.index) ids.push(constraint.index);
  if (constraint?.name) ids.push(constraint.name);
  return ids;
}
