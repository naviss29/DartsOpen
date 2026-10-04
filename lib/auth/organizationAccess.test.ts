import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ADR-0021 / lot L6 — règle d'accès DartsOpen : matrice OWNER / ADMIN / MEMBER / extérieur /
 * compte hérité, exclusion des organisations partagées héritées, repli créateur des tournois
 * sans organisation, cache 60 s et tolérance de panne 15 min (D10). Seules les frontières
 * externes sont simulées : SterPlatform (`apiFetch`), la base (`dbGetTournament`), les cookies.
 */

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieJar.set(name, value); },
    delete: (name: string) => { cookieJar.delete(name); },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn(), getServerToken: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/db/tournament", () => ({ dbGetTournament: vi.fn() }));

const access = await import("./organizationAccess");
const {
  getTournamentAccess,
  requireTournamentManager,
  requireTournamentReader,
  isTournamentManager,
  getCurrentOrganization,
  resolveTournamentCreationTarget,
  getMyMemberships,
  LEGACY_SHARED_ORG_SLUGS,
  LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED,
  CURRENT_ORG_COOKIE,
  MEMBERSHIP_FRESH_TTL_MS,
  MEMBERSHIP_STALE_MAX_MS,
  __resetMembershipCacheForTests,
} = access;
const { getUser, getServerToken } = await import("@/lib/api/auth");
const { apiFetch } = await import("@/lib/api/client");
const { dbGetTournament } = await import("@/lib/db/tournament");
const { catalogs } = await import("@/lib/i18n/catalogs");

const FR = catalogs.fr;
const ME = { id: "user-me", email: "moi@example.com", roles: [], isVerified: true };

const ORG_CLUB = { id: "org-club", slug: "club-a", name: "Club A" };
const ORG_OTHER = { id: "org-other", slug: "club-b", name: "Club B" };
const ORG_LEGACY = { id: "org-legacy", slug: "dartsopen", name: "DartsOpen" };

function tournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    association_id: "someone-else",
    organization_id: ORG_CLUB.id,
    organization_slug: ORG_CLUB.slug,
    name: "Open",
    status: "DRAFT",
    ...overrides,
  };
}

function respond(memberships: Array<{ id: string; slug: string; name: string; role: string }>) {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(memberships), { status: 200 }));
}
function failWith(status: number) {
  vi.mocked(apiFetch).mockResolvedValue(new Response("{}", { status }));
}

beforeEach(() => {
  __resetMembershipCacheForTests();
  cookieJar.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  vi.mocked(getUser).mockReset().mockResolvedValue(ME as never);
  vi.mocked(getServerToken).mockReset().mockResolvedValue("jwt-me");
  vi.mocked(apiFetch).mockReset();
  vi.mocked(dbGetTournament).mockReset().mockResolvedValue(tournament() as never);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("matrice des rôles sur un tournoi rattaché à une organisation", () => {
  it("OWNER : lecture et gestion", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    const result = await getTournamentAccess("t-1");
    expect(result).toMatchObject({ status: "OK", canManage: true, via: "OWNER", staleRole: false });
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });
    expect(await isTournamentManager("t-1")).toBe(true);
  });

  it("ADMIN : lecture et gestion (même droits qu'OWNER dans les produits)", async () => {
    respond([{ ...ORG_CLUB, role: "ADMIN" }]);
    expect(await getTournamentAccess("t-1")).toMatchObject({ status: "OK", canManage: true, via: "ADMIN" });
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });
  });

  it("MEMBER : lecture seule — la gestion est refusée par un message traduit, jamais un 404", async () => {
    respond([{ ...ORG_CLUB, role: "MEMBER" }]);
    expect(await getTournamentAccess("t-1")).toMatchObject({ status: "OK", canManage: false, via: "MEMBER" });
    expect(await requireTournamentReader("t-1")).toMatchObject({ status: "OK", canManage: false });
    expect(await requireTournamentManager("t-1")).toEqual({
      ok: false,
      reason: "NOT_MANAGER",
      error: FR["orgAccess.managerRequired"],
    });
    // Voie organisateur de la saisie de score (authorizeScoring) : fermée au MEMBER.
    expect(await isTournamentManager("t-1")).toBe(false);
  });

  it("extérieur (membre d'une autre organisation) : 404 en lecture comme en gestion", async () => {
    respond([{ ...ORG_OTHER, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
    await expect(requireTournamentReader("t-1")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requireTournamentManager("t-1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await isTournamentManager("t-1")).toBe(false);
  });

  it("le créateur n'a plus de droit sur un tournoi rattaché s'il n'est pas membre de son organisation", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(tournament({ association_id: ME.id }) as never);
    respond([{ ...ORG_OTHER, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
  });

  it("le rôle est celui de l'organisation DU TOURNOI, pas celui de l'organisation courante", async () => {
    cookieJar.set(CURRENT_ORG_COOKIE, ORG_OTHER.id);
    respond([{ ...ORG_OTHER, role: "OWNER" }, { ...ORG_CLUB, role: "MEMBER" }]);
    expect(await getTournamentAccess("t-1")).toMatchObject({ status: "OK", canManage: false, via: "MEMBER" });
  });

  it("non connecté : redirection SSO, jamais un 404", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(requireTournamentManager("t-1")).rejects.toThrow("NEXT_REDIRECT:/login");
    await expect(requireTournamentReader("t-1")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("tournoi inexistant : 404", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(null);
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    await expect(requireTournamentManager("t-x")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("compte hérité et exclusion des organisations partagées (ADR-0021 §3)", () => {
  it("la liste d'exclusion contient l'organisation partagée dartsopen (et billetasso)", () => {
    expect(LEGACY_SHARED_ORG_SLUGS).toContain("dartsopen");
    expect(LEGACY_SHARED_ORG_SLUGS).toContain("billetasso");
  });

  it("OWNER de l'organisation héritée : aucun droit sur un tournoi d'une vraie organisation", async () => {
    respond([{ ...ORG_LEGACY, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
  });

  it("jamais de droit via l'organisation héritée, même si l'UUID du tournoi correspond", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(
      tournament({ organization_id: ORG_LEGACY.id, organization_slug: null }) as never,
    );
    respond([{ ...ORG_LEGACY, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
  });

  it("tournoi rattaché par erreur à l'organisation héritée : traité comme sans organisation (repli créateur seul)", async () => {
    vi.mocked(dbGetTournament).mockResolvedValue(
      tournament({ organization_id: ORG_LEGACY.id, organization_slug: "dartsopen", association_id: "creator" }) as never,
    );
    respond([{ ...ORG_LEGACY, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });

    vi.mocked(getUser).mockResolvedValue({ ...ME, id: "creator" } as never);
    expect(await getTournamentAccess("t-1")).toMatchObject({ status: "OK", canManage: true, via: "CREATOR_FALLBACK" });
  });

  it("l'organisation héritée n'est jamais proposée comme organisation courante", async () => {
    respond([{ ...ORG_LEGACY, role: "OWNER" }]);
    cookieJar.set(CURRENT_ORG_COOKIE, ORG_LEGACY.id);
    expect(await getCurrentOrganization()).toEqual({ status: "OK", current: null, choices: [], needsSelection: false });
  });
});

describe("repli créateur des tournois sans organisation (transitoire, jusqu'au lot L7)", () => {
  beforeEach(() => {
    vi.mocked(dbGetTournament).mockResolvedValue(
      tournament({ organization_id: null, organization_slug: null, association_id: ME.id }) as never,
    );
  });

  it("le créateur garde tous les droits, sans interroger SterPlatform, et le repli est journalisé sans donnée personnelle", async () => {
    const result = await getTournamentAccess("t-1");
    expect(result).toMatchObject({ status: "OK", canManage: true, via: "CREATOR_FALLBACK" });
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });
    expect(apiFetch).not.toHaveBeenCalled();

    const logged = vi.mocked(console.info).mock.calls.flat().join(" ");
    expect(logged).toContain("t-1");
    expect(logged).not.toContain(ME.email);
    expect(logged).not.toContain(ME.id);
  });

  it("personne d'autre n'y accède, même OWNER d'une vraie organisation", async () => {
    vi.mocked(getUser).mockResolvedValue({ ...ME, id: "user-other" } as never);
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
  });

  it("SterPlatform injoignable ne bloque pas le créateur d'un tournoi hérité", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });
  });
});

describe("cache des rôles : 60 s, puis dernier rôle connu 15 min au plus si SterPlatform est injoignable (D10)", () => {
  it("un second appel dans les 60 s ne rappelle pas SterPlatform ; au-delà, relecture (retrait effectif)", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    await getMyMemberships();
    await getMyMemberships();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Le membre est retiré de l'organisation côté SterPlatform.
    respond([]);
    vi.setSystemTime(Date.now() + MEMBERSHIP_FRESH_TTL_MS + 1);
    expect(await getTournamentAccess("t-1")).toEqual({ status: "NOT_FOUND" });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("panne après 5 min : dernier rôle connu utilisé (gestion toujours possible), marqué comme ancien", async () => {
    respond([{ ...ORG_CLUB, role: "ADMIN" }]);
    await getMyMemberships();

    vi.mocked(apiFetch).mockRejectedValue(new Error("ECONNREFUSED"));
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    expect(await getTournamentAccess("t-1")).toMatchObject({ status: "OK", canManage: true, staleRole: true });
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });
  });

  it("panne exactement à 15 min : encore toléré ; au-delà : gestion refusée avec le message traduit", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    await getMyMemberships();
    const fetchedAt = Date.now();
    failWith(503);

    vi.setSystemTime(fetchedAt + MEMBERSHIP_STALE_MAX_MS);
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: true });

    vi.setSystemTime(fetchedAt + MEMBERSHIP_STALE_MAX_MS + 1);
    expect(await requireTournamentManager("t-1")).toEqual({
      ok: false,
      reason: "ROLE_UNAVAILABLE",
      error: FR["orgAccess.roleUnavailable"],
    });
    expect(await getTournamentAccess("t-1")).toEqual({ status: "ROLE_UNAVAILABLE" });
    await expect(requireTournamentReader("t-1")).rejects.toThrow("NEXT_REDIRECT:/tournaments?access=unavailable");
    expect(await isTournamentManager("t-1")).toBe(false);
  });

  it("panne sans aucun rôle connu : refus immédiat (jamais d'autorisation implicite)", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("timeout"));
    expect(await requireTournamentManager("t-1")).toMatchObject({ ok: false, reason: "ROLE_UNAVAILABLE" });
  });

  it("401 de SterPlatform n'est pas une panne : aucun repli sur l'ancien rôle", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    await getMyMemberships();
    failWith(401);
    vi.setSystemTime(Date.now() + MEMBERSHIP_FRESH_TTL_MS + 1);
    expect(await getMyMemberships()).toEqual({ status: "UNAUTHENTICATED" });
    await expect(requireTournamentManager("t-1")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("réponse illisible traitée comme une panne (jamais un rôle inventé)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify([{ slug: "club-a", role: "GOD" }]), { status: 200 }));
    expect(await getMyMemberships()).toEqual({ status: "UNAVAILABLE" });
  });

  it("deux jetons différents ne partagent jamais une entrée du cache", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }]);
    await getMyMemberships();
    vi.mocked(getServerToken).mockResolvedValue("jwt-someone-else");
    respond([]);
    expect(await getMyMemberships()).toEqual({ status: "OK", memberships: [], stale: false });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe("organisation courante et cible de création", () => {
  it("une seule vraie organisation : choisie par défaut", async () => {
    respond([{ ...ORG_LEGACY, role: "OWNER" }, { ...ORG_CLUB, role: "ADMIN" }]);
    expect(await getCurrentOrganization()).toMatchObject({ status: "OK", current: { id: ORG_CLUB.id }, needsSelection: false });
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: true, organization: { id: ORG_CLUB.id, slug: ORG_CLUB.slug } });
  });

  it("plusieurs organisations sans choix : sélecteur requis, création refusée", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }, { ...ORG_OTHER, role: "OWNER" }]);
    expect(await getCurrentOrganization()).toMatchObject({ status: "OK", current: null, needsSelection: true });
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: false, error: FR["orgAccess.creation.chooseOrganization"] });
  });

  it("cookie valide : organisation choisie ; cookie d'une organisation dont on n'est pas membre : ignoré", async () => {
    respond([{ ...ORG_CLUB, role: "OWNER" }, { ...ORG_OTHER, role: "ADMIN" }]);
    cookieJar.set(CURRENT_ORG_COOKIE, ORG_OTHER.id);
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: true, organization: { id: ORG_OTHER.id, slug: ORG_OTHER.slug } });

    cookieJar.set(CURRENT_ORG_COOKIE, "org-forged");
    expect(await getCurrentOrganization()).toMatchObject({ current: null, needsSelection: true });
  });

  it("MEMBER de l'organisation courante : création refusée (lecture seule)", async () => {
    respond([{ ...ORG_CLUB, role: "MEMBER" }]);
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: false, error: FR["orgAccess.creation.memberOnly"] });
  });

  it("compte hérité (aucune vraie organisation) : création sans organisation tant que D3 le permet", async () => {
    respond([{ ...ORG_LEGACY, role: "OWNER" }]);
    expect(LEGACY_CREATION_WITHOUT_ORGANIZATION_ALLOWED).toBe(true);
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: true, organization: null });
  });

  it("SterPlatform injoignable sans rôle connu : création refusée (D10)", async () => {
    failWith(500);
    expect(await resolveTournamentCreationTarget()).toEqual({ ok: false, error: FR["orgAccess.roleUnavailable"] });
  });
});
