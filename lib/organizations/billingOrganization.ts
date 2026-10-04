import { dbGetOrganization } from "@/lib/db/tournament";
import { getMyMemberships } from "@/lib/auth/organizationAccess";
import { effectiveOrganizationId } from "@/lib/auth/legacyOrganizations";

/**
 * ADR-0021 (option A) / lot L7 — QUELLE organisation SterPlatform porte le paiement en ligne
 * (Stripe Connect) et les droits DartsOpen (abonnement, crédits tournoi) d'un tournoi.
 *
 * Avant L7, tout passait par la table locale `Organization` du CRÉATEUR (liaison de la page
 * Paramètres, `dbGetOrganization(userId)`) : une organisation dont Stripe Connect était
 * opérationnel dans BSsite voyait pourtant « configurer Stripe Connect » dans DartsOpen dès que
 * le créateur n'avait pas (ou plus) lié la même organisation (BUG-4, recette staging), et un
 * ADMIN non créateur interrogeait l'organisation liée d'un autre compte avec son propre JWT.
 *
 * Règle unique, la même que pour les droits (L6) :
 * - tournoi rattaché à une vraie organisation ⇒ CETTE organisation ;
 * - création ⇒ l'organisation courante retenue par `resolveTournamentCreationTarget()` ;
 * - tournoi sans organisation (données d'avant L6, ou organisation héritée partagée) ou création
 *   sans organisation (D3) ⇒ repli transitoire sur la liaison locale du créateur, jusqu'au lot L8
 *   qui supprimera la table (feu vert d'Alan).
 */
export type BillingOrganizationSource =
  | { kind: "ORGANIZATION"; organizationId: string; organizationSlug: string | null }
  | { kind: "CREATOR_FALLBACK"; creatorUserId: string };

export function billingSourceForTournament(tournament: {
  association_id: string;
  organization_id: string | null;
  organization_slug: string | null;
}): BillingOrganizationSource {
  const organizationId = effectiveOrganizationId(tournament);
  if (organizationId) {
    return { kind: "ORGANIZATION", organizationId, organizationSlug: tournament.organization_slug };
  }
  return { kind: "CREATOR_FALLBACK", creatorUserId: tournament.association_id };
}

/**
 * `organization` = cible de création déjà revérifiée auprès de SterPlatform
 * (`resolveTournamentCreationTarget()`), jamais une valeur du formulaire. `null` : création sans
 * organisation autorisée par D3 ⇒ repli sur la liaison locale de l'utilisateur qui crée.
 */
export function billingSourceForCreation(
  userId: string,
  organization: { id: string; slug: string } | null,
): BillingOrganizationSource {
  if (organization) {
    return { kind: "ORGANIZATION", organizationId: organization.id, organizationSlug: organization.slug };
  }
  return { kind: "CREATOR_FALLBACK", creatorUserId: userId };
}

/**
 * Slug à transmettre aux routes SterPlatform (toutes indexées par slug). `null` : aucune
 * organisation exploitable (repli créateur sans liaison) — une absence réelle, à ne jamais
 * confondre avec une panne.
 *
 * `authenticated` (pages et Server Actions d'organisateur) : le slug est relu dans les
 * appartenances SterPlatform par UUID, car l'UUID est la clé d'autorité et le slug reste
 * modifiable par le staff (EasyAdmin) ; le slug enregistré sur le tournoi ne sert que de repli
 * (appartenances indisponibles). Parcours public (inscription d'un joueur, sans JWT) : seul le
 * slug enregistré est disponible.
 *
 * Une erreur de lecture de la liaison locale est levée avec un message clair, jamais convertie en
 * « aucune organisation » : ce serait afficher « configurer Stripe Connect » à une organisation
 * dont le compte est peut-être opérationnel (même confusion que DARTSOPEN-MONETIZATION-002).
 */
export async function resolveBillingOrganizationSlug(
  source: BillingOrganizationSource,
  options: { authenticated: boolean },
): Promise<string | null> {
  if (source.kind === "CREATOR_FALLBACK") {
    try {
      const org = await dbGetOrganization(source.creatorUserId);
      return org?.sterOrganizationSlug ?? null;
    } catch (err) {
      console.error("[billingOrganization] lecture de la liaison locale du créateur impossible", err);
      throw new Error("Lecture de l'organisation liée du créateur impossible (base DartsOpen).", { cause: err });
    }
  }

  if (options.authenticated) {
    try {
      const memberships = await getMyMemberships();
      if (memberships.status === "OK") {
        const membership = memberships.memberships.find((m) => m.id === source.organizationId);
        if (membership) return membership.slug;
      }
    } catch (err) {
      // getMyMemberships ne lève pas en temps normal ; par prudence on retombe sur le slug
      // enregistré plutôt que de bloquer l'affichage ou la décision.
      console.warn("[billingOrganization] appartenances illisibles, slug enregistré utilisé", err);
    }
  }
  return source.organizationSlug;
}
