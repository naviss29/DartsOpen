import { cache } from "react";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getServerToken, getUser } from "@/lib/api/auth";
import { apiFetch } from "@/lib/api/client";
import { dbGetTournament } from "@/lib/db/tournament";
import { getI18n } from "@/lib/i18n/server";
import { isLegacySharedOrganization, effectiveOrganizationId } from "@/lib/auth/legacyOrganizations";

export { LEGACY_SHARED_ORG_SLUGS, isLegacySharedOrganization, effectiveOrganizationId } from "@/lib/auth/legacyOrganizations";

/**
 * ADR-0021 (option A) / lot L6 — droits DartsOpen lus dans l'organisation SterPlatform du
 * tournoi : OWNER/ADMIN gèrent, MEMBER consulte. Le créateur (`Tournament.userId`) reste
 * enregistré (idempotence, emails) mais ne donne plus de droits, SAUF repli transitoire pour un
 * tournoi encore sans organisation (créé avant L6, rattachement au lot L7).
 *
 * SterPlatform reste la seule source du rôle : ce module ne stocke rien en base, il garde
 * seulement en mémoire la dernière réponse de `GET /api/me/organizations` (voir cache ci-dessous).
 */

export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";

export type Membership = {
  /** UUID SterPlatform — clé d'autorité, comparée à `Tournament.organizationId`. */
  id: string;
  slug: string;
  name: string;
  role: OrganizationRole;
};

export function canManageRole(role: OrganizationRole | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * D3 — tant que ce drapeau est `true`, un compte SANS vraie organisation (uniquement membre
 * d'une organisation héritée) peut encore créer un tournoi « à l'ancienne » (sans organisation,
 * droits par créateur). Alan annoncera par email une date de fin : ce jour-là, passer ce seul
 * drapeau à `false` (createTournament refusera alors avec `orgAccess.creation.organizationRequired`).
 */
export const LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED = true;

/** Cookie de l'organisation courante choisie dans le sélecteur ; toujours revérifié. */
export const CURRENT_ORG_COOKIE = "do_current_org";

// ── Appartenances (GET /api/me/organizations) ────────────────────────────────

/** Retrait d'un membre effectif sous 60 s (ADR-0021 §5) : au-delà, on relit SterPlatform. */
export const MEMBERSHIP_FRESH_TTL_MS = 60 * 1000;
/** D10 — SterPlatform injoignable : dernier rôle connu gardé 15 min au plus, jamais plus. */
export const MEMBERSHIP_STALE_MAX_MS = 15 * 60 * 1000;
const MEMBERSHIP_FETCH_TIMEOUT_MS = 5000;
const MEMBERSHIP_CACHE_MAX_ENTRIES = 5000;

export type MembershipsResult =
  | { status: "OK"; memberships: Membership[]; stale: boolean }
  | { status: "UNAUTHENTICATED" }
  | { status: "UNAVAILABLE" };

type CacheEntry = { memberships: Membership[]; fetchedAt: number };

/**
 * Cache inter-requêtes, en mémoire du processus, indexé par l'empreinte SHA-256 du jeton : le
 * jeton lui-même n'est jamais conservé, et deux utilisateurs ne partagent jamais une entrée.
 * Une instance Next redémarrée repart à vide (pire cas : un appel SterPlatform de plus).
 */
const membershipCache = new Map<string, CacheEntry>();

export function __resetMembershipCacheForTests(): void {
  membershipCache.clear();
}

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function remember(key: string, memberships: Membership[], now: number): void {
  // Purge des entrées inutilisables (au-delà de 15 min elles ne servent plus à rien) et borne
  // dure sur la taille : jamais une fuite mémoire si beaucoup de jetons différents passent.
  for (const [k, entry] of membershipCache) {
    if (now - entry.fetchedAt > MEMBERSHIP_STALE_MAX_MS) membershipCache.delete(k);
  }
  if (membershipCache.size >= MEMBERSHIP_CACHE_MAX_ENTRIES) {
    const oldest = membershipCache.keys().next().value;
    if (oldest !== undefined) membershipCache.delete(oldest);
  }
  membershipCache.set(key, { memberships, fetchedAt: now });
}

function parseMemberships(payload: unknown): Membership[] | null {
  if (!Array.isArray(payload)) return null;
  const result: Membership[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") return null;
    const { id, slug, name, role } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof slug !== "string" || typeof role !== "string") return null;
    if (role !== "OWNER" && role !== "ADMIN" && role !== "MEMBER") return null;
    result.push({ id, slug, name: typeof name === "string" ? name : slug, role });
  }
  return result;
}

/**
 * Appartenances de l'utilisateur connecté. `cache()` déduplique au sein d'un rendu (layout +
 * page + actions), la Map ci-dessus entre requêtes (60 s). Sur panne SterPlatform (réseau,
 * délai, 5xx, réponse illisible) : dernier résultat connu s'il a moins de 15 min (`stale`),
 * sinon `UNAVAILABLE` — jamais un rôle gardé sans limite (D10). Un 401/403 n'est PAS une
 * panne : jeton refusé ⇒ aucun rôle, jamais de repli sur l'ancien.
 */
export const getMyMemberships = cache(async (): Promise<MembershipsResult> => {
  const token = await getServerToken();
  if (!token) return { status: "UNAUTHENTICATED" };

  const key = tokenKey(token);
  const now = Date.now();
  const cached = membershipCache.get(key);
  if (cached && now - cached.fetchedAt < MEMBERSHIP_FRESH_TTL_MS) {
    return { status: "OK", memberships: cached.memberships, stale: false };
  }

  try {
    const res = await apiFetch(
      "/api/me/organizations",
      { cache: "no-store", signal: AbortSignal.timeout(MEMBERSHIP_FETCH_TIMEOUT_MS) },
      token,
    );
    if (res.status === 401 || res.status === 403) {
      membershipCache.delete(key);
      return { status: "UNAUTHENTICATED" };
    }
    if (!res.ok) throw new Error(`SterPlatform /api/me/organizations a répondu ${res.status}`);
    const memberships = parseMemberships(await res.json());
    if (!memberships) throw new Error("réponse /api/me/organizations illisible");
    remember(key, memberships, Date.now());
    return { status: "OK", memberships, stale: false };
  } catch (err) {
    if (cached && now - cached.fetchedAt <= MEMBERSHIP_STALE_MAX_MS) {
      console.warn("[organizationAccess] SterPlatform injoignable, dernier rôle connu utilisé (D10)", err);
      return { status: "OK", memberships: cached.memberships, stale: true };
    }
    console.error("[organizationAccess] SterPlatform injoignable, aucun rôle connu de moins de 15 min (D10)", err);
    return { status: "UNAVAILABLE" };
  }
});

/** Appartenances qui peuvent donner des droits : jamais une organisation héritée partagée. */
export function realMemberships(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => !isLegacySharedOrganization(m.slug));
}

// ── Organisation courante ────────────────────────────────────────────────────

export type CurrentOrganization =
  | {
      status: "OK";
      /** null : aucune vraie organisation, ou plusieurs sans choix fait (`needsSelection`). */
      current: Membership | null;
      choices: Membership[];
      needsSelection: boolean;
    }
  | { status: "UNAUTHENTICATED" }
  | { status: "UNAVAILABLE" };

/**
 * Organisation dans laquelle l'utilisateur travaille : celle du cookie `do_current_org` si elle
 * figure encore parmi ses vraies appartenances (le cookie n'est jamais une preuve), sinon
 * l'unique vraie organisation, sinon aucune (0 ⇒ compte hérité ; plusieurs ⇒ sélecteur).
 */
export const getCurrentOrganization = cache(async (): Promise<CurrentOrganization> => {
  const result = await getMyMemberships();
  if (result.status !== "OK") return result;

  const choices = realMemberships(result.memberships);
  let chosenId: string | undefined;
  try {
    chosenId = (await cookies()).get(CURRENT_ORG_COOKIE)?.value;
  } catch (err) {
    // Hors requête (test, build statique) : aucun choix mémorisé, on retombe sur la règle par défaut.
    console.warn("[organizationAccess] cookie d'organisation courante illisible", err);
  }

  const fromCookie = chosenId ? choices.find((m) => m.id === chosenId) : undefined;
  if (fromCookie) return { status: "OK", current: fromCookie, choices, needsSelection: false };
  if (choices.length === 1) return { status: "OK", current: choices[0], choices, needsSelection: false };
  return { status: "OK", current: null, choices, needsSelection: choices.length > 1 };
});

// ── Accès à un tournoi ───────────────────────────────────────────────────────

export type AccessibleTournament = NonNullable<Awaited<ReturnType<typeof dbGetTournament>>>;

export type TournamentAccess =
  | {
      status: "OK";
      tournament: AccessibleTournament;
      canManage: boolean;
      /** "CREATOR_FALLBACK" : tournoi sans organisation, droits complets de son créateur (transitoire). */
      via: OrganizationRole | "CREATOR_FALLBACK";
      /** true : rôle issu du dernier résultat connu (SterPlatform injoignable depuis < 15 min). */
      staleRole: boolean;
    }
  | { status: "UNAUTHENTICATED" }
  | { status: "NOT_FOUND" }
  | { status: "ROLE_UNAVAILABLE" };


/**
 * Règle unique d'accès (lecture pour tout rôle, gestion pour OWNER/ADMIN) :
 * - tournoi rattaché à une organisation ⇒ rôle de l'utilisateur dans CETTE organisation, quelle
 *   que soit l'organisation courante choisie dans le sélecteur ; pas membre ⇒ NOT_FOUND (404
 *   indiscernable d'un tournoi inexistant, comme avant) ;
 * - tournoi sans organisation ⇒ repli transitoire sur le créateur (droits complets), journalisé
 *   par id de tournoi uniquement. Ce chemin n'interroge jamais SterPlatform au-delà de `getUser`.
 */
export async function getTournamentAccess(tournamentId: string): Promise<TournamentAccess> {
  const user = await getUser();
  if (!user) return { status: "UNAUTHENTICATED" };

  const tournament = await dbGetTournament(tournamentId);
  if (!tournament) return { status: "NOT_FOUND" };

  const organizationId = effectiveOrganizationId(tournament);
  if (!organizationId) {
    if (tournament.association_id !== user.id) return { status: "NOT_FOUND" };
    // Aucune donnée personnelle : l'id du tournoi suffit à mesurer ce qu'il reste à rattacher (L7).
    console.info(`[organizationAccess] repli créateur (tournoi sans organisation) tournoi=${tournament.id}`);
    return { status: "OK", tournament, canManage: true, via: "CREATOR_FALLBACK", staleRole: false };
  }

  const memberships = await getMyMemberships();
  if (memberships.status === "UNAUTHENTICATED") return { status: "UNAUTHENTICATED" };
  if (memberships.status === "UNAVAILABLE") return { status: "ROLE_UNAVAILABLE" };

  const membership = realMemberships(memberships.memberships).find((m) => m.id === organizationId);
  if (!membership) return { status: "NOT_FOUND" };

  return {
    status: "OK",
    tournament,
    canManage: canManageRole(membership.role),
    via: membership.role,
    staleRole: memberships.stale,
  };
}

/**
 * Pour les pages du tableau de bord : lecture autorisée à tout rôle. Non connecté ⇒ SSO ;
 * pas d'accès ⇒ 404 ; rôle invérifiable depuis plus de 15 min ⇒ liste des tournois avec le
 * message D10 (le tournoi d'une organisation ne peut pas être montré sans preuve d'appartenance).
 */
export async function requireTournamentReader(tournamentId: string) {
  const access = await getTournamentAccess(tournamentId);
  if (access.status === "UNAUTHENTICATED") redirect("/login");
  if (access.status === "NOT_FOUND") notFound();
  if (access.status === "ROLE_UNAVAILABLE") redirect("/tournaments?access=unavailable");
  return access;
}

export type ManagerCheck =
  | { ok: true; tournament: AccessibleTournament; access: Extract<TournamentAccess, { status: "OK" }> }
  | { ok: false; reason: "NOT_MANAGER" | "ROLE_UNAVAILABLE"; error: string };

/**
 * Garde de TOUTE Server Action de gestion (remplace l'ancien `getOwnedTournament`). Non connecté
 * ⇒ `redirect()` ; aucun accès ⇒ `notFound()` (throws Next.js : ne jamais les envelopper dans un
 * `.catch()`). Un utilisateur qui voit le tournoi mais ne peut pas le gérer (MEMBER, ou rôle
 * invérifiable depuis plus de 15 min — D10) reçoit un REFUS RETOURNÉ, avec un message traduit :
 * une erreur levée dans une Server Action perd son message en production, l'organisateur ne
 * verrait alors qu'une erreur générique.
 */
export async function requireTournamentManager(tournamentId: string): Promise<ManagerCheck> {
  const access = await getTournamentAccess(tournamentId);
  if (access.status === "UNAUTHENTICATED") redirect("/login");
  if (access.status === "NOT_FOUND") notFound();

  const { t } = await getI18n();
  if (access.status === "ROLE_UNAVAILABLE") {
    return { ok: false, reason: "ROLE_UNAVAILABLE", error: t("orgAccess.roleUnavailable") };
  }
  if (!access.canManage) {
    return { ok: false, reason: "NOT_MANAGER", error: t("orgAccess.managerRequired") };
  }
  return { ok: true, tournament: access.tournament, access };
}

export type CreationTarget =
  | { ok: true; organization: { id: string; slug: string } | null }
  | { ok: false; error: string };

/**
 * Où créer un nouveau tournoi (point 5 du lot L6) :
 * - organisation courante où l'utilisateur est OWNER/ADMIN ⇒ tournoi rattaché ;
 * - organisation courante où il n'est que MEMBER ⇒ refus (lecture seule) ;
 * - plusieurs vraies organisations sans choix ⇒ refus, choisir d'abord dans le sélecteur ;
 * - aucune vraie organisation (compte hérité) ⇒ création sans organisation tant que
 *   LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED (D3), sinon refus ;
 * - rôle invérifiable ⇒ refus D10 (créer est une action de gestion).
 */
export async function resolveTournamentCreationTarget(): Promise<CreationTarget> {
  const { t } = await getI18n();
  const current = await getCurrentOrganization();
  if (current.status === "UNAUTHENTICATED") redirect("/login");
  if (current.status === "UNAVAILABLE") return { ok: false, error: t("orgAccess.roleUnavailable") };

  if (current.current) {
    if (!canManageRole(current.current.role)) return { ok: false, error: t("orgAccess.creation.memberOnly") };
    return { ok: true, organization: { id: current.current.id, slug: current.current.slug } };
  }
  if (current.needsSelection) return { ok: false, error: t("orgAccess.creation.chooseOrganization") };
  if (!LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED) {
    return { ok: false, error: t("orgAccess.creation.organizationRequired") };
  }
  return { ok: true, organization: null };
}

/**
 * Variante sans throw pour `authorizeScoring` (voie organisateur de la saisie de score) : `true`
 * seulement pour un gestionnaire confirmé. Tout autre cas retombe sur la session terrain,
 * jamais l'inverse.
 */
export async function isTournamentManager(tournamentId: string): Promise<boolean> {
  const access = await getTournamentAccess(tournamentId);
  return access.status === "OK" && access.canManage;
}
