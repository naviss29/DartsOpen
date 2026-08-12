import { getServerToken } from "./auth";
import { apiFetch } from "./client";

/**
 * DARTSOPEN-MONETIZATION-001 — client JWT (organisateur authentifié, jamais serveur-à-serveur)
 * vers les routes crédit tournoi de SterPlatform. Contrairement à
 * lib/api/sterplatformInternal.ts (réservé au parcours d'inscription publique, sans JWT), tous
 * les appelants ici s'exécutent après getUser()/getOwnedTournament() — le JWT de la requête
 * courante est donc toujours disponible et correspond à l'organisateur concerné.
 */

export type ConsumeTournamentCreditResult =
  | { ok: true; creditId: string }
  | { ok: false; status: number };

/**
 * `POST /api/organizations/{slug}/tournament-credits/consume` — consomme définitivement un
 * crédit tournoi disponible pour (organisation, DARTSOPEN), idempotent sur `reference`
 * (l'id du tournoi DartsOpen concerné — voir lib/entitlements/tournamentSizeGuard.ts). Un 409
 * signifie simplement "aucun crédit disponible", jamais journalisé comme une erreur (c'est le
 * cas d'usage normal d'une organisation sans crédit) ; tout autre échec (réseau, 5xx) est
 * journalisé — jamais un `.catch(() => null)` muet (CLAUDE.md §Gestion des erreurs).
 */
export async function consumeTournamentCredit(slug: string, reference: string): Promise<ConsumeTournamentCreditResult> {
  const token = await getServerToken();
  if (!token) return { ok: false, status: 401 };

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

    if (!res.ok) {
      if (res.status !== 409) {
        console.error("[consumeTournamentCredit] SterPlatform responded", res.status, slug, reference);
      }
      return { ok: false, status: res.status };
    }

    const data = await res.json() as { creditId: string };
    return { ok: true, creditId: data.creditId };
  } catch (err) {
    console.error("[consumeTournamentCredit] request failed", slug, reference, err);
    return { ok: false, status: 0 };
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
