import { getServerToken } from "./auth";
import { apiFetch } from "./client";

/**
 * DARTSOPEN-MONETIZATION-001 — client JWT (organisateur authentifié, jamais serveur-à-serveur)
 * vers les routes crédit tournoi de SterPlatform. Contrairement à
 * lib/api/sterplatformInternal.ts (réservé au parcours d'inscription publique, sans JWT), tous
 * les appelants ici s'exécutent après getUser()/getOwnedTournament() — le JWT de la requête
 * courante est donc toujours disponible et correspond à l'organisateur concerné.
 */

/**
 * DARTSOPEN-MONETIZATION-003 (P2, contre-audit) — trois issues distinctes, jamais un simple
 * booléen : CONFIRMED (crédit réellement consommé), REJECTED (refus métier certain — 409,
 * "aucun crédit disponible", ou aucun jeton disponible donc aucun appel n'a même pu partir) et
 * INDETERMINATE (erreur réseau/timeout/5xx — l'issue réelle côté SterPlatform est inconnue,
 * jamais assimilée à un refus). Voir lib/entitlements/tournamentSizeGuard.ts pour la
 * réconciliation qui suit une issue INDETERMINATE.
 */
export type ConsumeTournamentCreditResult =
  | { outcome: "CONFIRMED"; creditId: string }
  | { outcome: "REJECTED" }
  | { outcome: "INDETERMINATE" };

/**
 * `POST /api/organizations/{slug}/tournament-credits/consume` — consomme définitivement un
 * crédit tournoi disponible pour (organisation, DARTSOPEN), idempotent sur `reference`
 * (l'id du tournoi DartsOpen concerné — voir lib/entitlements/tournamentSizeGuard.ts). Un 409
 * signifie un refus métier certain ("aucun crédit disponible"), jamais journalisé comme une
 * erreur (c'est le cas d'usage normal d'une organisation sans crédit) ; tout autre échec
 * (réseau, 5xx, statut HTTP inattendu) est INDETERMINATE et journalisé — jamais un
 * `.catch(() => null)` muet (CLAUDE.md §Gestion des erreurs), et surtout jamais confondu avec
 * REJECTED : une erreur réseau/timeout n'est jamais un refus métier.
 */
export async function consumeTournamentCredit(slug: string, reference: string): Promise<ConsumeTournamentCreditResult> {
  const token = await getServerToken();
  // Aucun jeton : aucun appel n'a jamais quitté DartsOpen, donc rien n'a pu être consommé côté
  // SterPlatform — un refus certain, pas une ambiguïté réseau.
  if (!token) return { outcome: "REJECTED" };

  try {
    const res = await apiFetch(
      `/api/organizations/${encodeURIComponent(slug)}/tournament-credits/consume`,
      {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ product: "DARTSOPEN", reference }),
      },
      token,
    );

    if (res.ok) {
      const data = await res.json() as { creditId: string };
      return { outcome: "CONFIRMED", creditId: data.creditId };
    }

    if (res.status === 409) {
      return { outcome: "REJECTED" };
    }

    console.error("[consumeTournamentCredit] SterPlatform responded", res.status, slug, reference);
    return { outcome: "INDETERMINATE" };
  } catch (err) {
    console.error("[consumeTournamentCredit] request failed", slug, reference, err);
    return { outcome: "INDETERMINATE" };
  }
}

export type CreditReconciliationResult = "CONSUMED" | "NOT_CONSUMED" | "INDETERMINATE";

/**
 * `GET /api/organizations/{slug}/tournament-credits/status?product=X&reference=Y` —
 * DARTSOPEN-MONETIZATION-003 (P2, contre-audit) : interroge SterPlatform, en lecture seule,
 * « cette référence a-t-elle déjà consommé un crédit ? ». Appelé uniquement après un
 * consumeTournamentCredit() INDETERMINATE (réponse perdue/timeout) — jamais une seconde
 * tentative de consommation, jamais une hypothèse locale. SterPlatform reste la seule source de
 * vérité (mission §2).
 */
export async function reconcileTournamentCredit(slug: string, reference: string): Promise<CreditReconciliationResult> {
  const token = await getServerToken();
  if (!token) return "INDETERMINATE";

  try {
    const res = await apiFetch(
      `/api/organizations/${encodeURIComponent(slug)}/tournament-credits/status?product=DARTSOPEN&reference=${encodeURIComponent(reference)}`,
      { cache: "no-store" },
      token,
    );
    if (!res.ok) {
      console.error("[reconcileTournamentCredit] SterPlatform responded", res.status, slug, reference);
      return "INDETERMINATE";
    }
    const data = await res.json() as { consumed: boolean };
    return data.consumed ? "CONSUMED" : "NOT_CONSUMED";
  } catch (err) {
    console.error("[reconcileTournamentCredit] request failed", slug, reference, err);
    return "INDETERMINATE";
  }
}

/**
 * `GET /api/organizations/{slug}/tournament-credits?product=DARTSOPEN` — nombre de crédits
 * tournoi non consommés, pour affichage uniquement (mission §10, "Nombre de joueurs max [16]...
 * achetez un crédit"). Jamais utilisé pour la décision d'autorisation elle-même (voir
 * lib/entitlements/tournamentSizeGuard.ts::authorizeTournamentSize(), qui consomme directement
 * plutôt que de lire ce compteur puis décider séparément — évite toute fenêtre de course entre
 * lecture et décision).
 */
export async function getTournamentCreditsAvailable(slug: string): Promise<number> {
  const token = await getServerToken();
  if (!token) return 0;

  try {
    const res = await apiFetch(
      `/api/organizations/${encodeURIComponent(slug)}/tournament-credits?product=DARTSOPEN`,
      { cache: "no-store" },
      token,
    );
    if (!res.ok) {
      console.error("[getTournamentCreditsAvailable] SterPlatform responded", res.status, slug);
      return 0;
    }
    const data = await res.json() as { available: number };
    return data.available;
  } catch (err) {
    console.error("[getTournamentCreditsAvailable] request failed", slug, err);
    return 0;
  }
}
