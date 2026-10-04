/**
 * Organisations partagées héritées de la migration Organization-First : elles regroupent des
 * comptes sans lien entre eux (ADR-0021 §3, `LegacySharedOrganization::SLUGS` côté
 * SterPlatform). Elles ne donnent JAMAIS de droits dans DartsOpen : un rôle OWNER dans
 * `dartsopen` ne prouve pas qu'on administre un club. `billetasso` est listée aussi : c'est
 * l'autre organisation partagée de l'ADR, et un compte BilletAsso historique ne doit pas pouvoir
 * s'en servir comme « vraie » organisation ici.
 *
 * Module sans dépendance (ni `next/headers` ni Prisma) : importable par `lib/db` et par les
 * scripts CLI sans créer de cycle avec `lib/auth/organizationAccess.ts`.
 */
export const LEGACY_SHARED_ORG_SLUGS: readonly string[] = ["dartsopen", "billetasso"];

export function isLegacySharedOrganization(slug: string | null | undefined): boolean {
  return !!slug && LEGACY_SHARED_ORG_SLUGS.includes(slug);
}

/**
 * Organisation qui fait autorité sur le tournoi (droits, paiement, crédits, rappels) ; une
 * organisation héritée partagée ne compte jamais. `null` ⇒ tournoi « sans organisation » :
 * repli transitoire sur son créateur (ADR-0021 §3). Ici (module pur) plutôt que dans
 * `organizationAccess.ts` pour que la purge CLI applique exactement la même règle sans importer
 * `next/headers`.
 */
export function effectiveOrganizationId(tournament: { organization_id: string | null; organization_slug: string | null }): string | null {
  if (!tournament.organization_id) return null;
  if (isLegacySharedOrganization(tournament.organization_slug)) return null;
  return tournament.organization_id;
}
