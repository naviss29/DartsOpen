import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";

/**
 * ADR-0021 / lot L6 — matrice OWNER / ADMIN / MEMBER / extérieur / compte hérité sur de VRAIES
 * Server Actions et de vraies lignes PostgreSQL (jamais une base de travail : lancer avec
 * DATABASE_URL=…/dartsopen_purge_test). Seules les frontières externes sont simulées :
 * SterPlatform (`apiFetch` pour /api/me/organizations, `getUser`) et les cookies Next.js.
 * Actions représentatives : lecture (page), gestion (addRound), accès arbitre (D7,
 * generateRefereeAccess), voie organisateur de la saisie de score (authorizeScoring), listes.
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mercure", () => ({ publishMatchUpdate: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn(), getServerToken: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

const { prisma } = await import("@/lib/db/client");
const { dbCreateTournament, dbListTournaments, dbListAllTournaments } = await import("@/lib/db/tournament");
const { getUser, getServerToken } = await import("@/lib/api/auth");
const { apiFetch } = await import("@/lib/api/client");
const { requireTournamentReader, __resetMembershipCacheForTests } = await import("./organizationAccess");
const { addRound } = await import("@/lib/actions/tournament");
const { addPlayer } = await import("@/lib/actions/player");
const { generateRefereeAccess } = await import("@/lib/actions/fieldReferee");
const { authorizeScoring } = await import("@/lib/actions/fieldAccess");
const { catalogs } = await import("@/lib/i18n/catalogs");

const ORG = { id: `org-${randomUUID()}`, slug: "club-l6", name: "Club L6" };
const OTHER_ORG = { id: `org-${randomUUID()}`, slug: "club-l6-b", name: "Club L6 B" };
const LEGACY_ORG = { id: `org-${randomUUID()}`, slug: "dartsopen", name: "DartsOpen" };
const CREATOR_ID = `creator-${randomUUID()}`;

type Profile = { name: string; memberships: Array<typeof ORG & { role: string }> };
const PROFILES: Record<string, Profile> = {
  OWNER: { name: "OWNER", memberships: [{ ...ORG, role: "OWNER" }] },
  ADMIN: { name: "ADMIN", memberships: [{ ...ORG, role: "ADMIN" }] },
  MEMBER: { name: "MEMBER", memberships: [{ ...ORG, role: "MEMBER" }] },
  OUTSIDER: { name: "OUTSIDER", memberships: [{ ...OTHER_ORG, role: "OWNER" }] },
  LEGACY: { name: "LEGACY", memberships: [{ ...LEGACY_ORG, role: "OWNER" }] },
};

function actAs(profile: Profile, userId = `user-${profile.name}`) {
  __resetMembershipCacheForTests();
  vi.mocked(getUser).mockResolvedValue({ id: userId, email: `${profile.name}@example.com`, roles: [], isVerified: true } as never);
  vi.mocked(getServerToken).mockResolvedValue(`jwt-${userId}`);
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify(profile.memberships), { status: 200 }));
}

const created: string[] = [];

async function makeTournament(organization: { id: string; slug: string } | null, creator = CREATOR_ID) {
  const t = await dbCreateTournament(
    creator,
    {
      name: "Tournoi L6",
      date: "2026-11-01",
      location: "Brest",
      max_players: 8,
      entry_fee: 0,
      nb_pools: 1,
      nb_boards: 2,
      advancement_per_pool: 1,
      players_per_team: 1,
      registration_mode: "ONSITE",
      payment_mode: "ONSITE",
      scoring_mode: "TRADITIONAL",
    },
    randomUUID(),
    "DRAFT",
    organization,
  );
  created.push(t.id);
  return t;
}

function roundForm(tournamentId: string) {
  const fd = new FormData();
  fd.set("tournament_id", tournamentId);
  fd.set("game_type", "501");
  fd.set("entry_type", "SINGLE");
  fd.set("finish_type", "DOUBLE");
  return fd;
}

beforeEach(() => {
  cookieJar.clear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (created.length) {
    await prisma.fieldRefereeGrant.deleteMany({ where: { tournamentId: { in: created } } });
    await prisma.round.deleteMany({ where: { tournamentId: { in: created } } });
    await prisma.registration.deleteMany({ where: { tournamentId: { in: created } } });
    await prisma.tournament.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
});

describe("colonnes L6 en base", () => {
  it("dbCreateTournament enregistre organizationId/organizationSlug ; null pour une création héritée", async () => {
    const withOrg = await makeTournament(ORG);
    const legacy = await makeTournament(null);
    const rows = await prisma.tournament.findMany({ where: { id: { in: [withOrg.id, legacy.id] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(withOrg.id)).toMatchObject({ organizationId: ORG.id, organizationSlug: ORG.slug, userId: CREATOR_ID });
    expect(byId.get(legacy.id)).toMatchObject({ organizationId: null, organizationSlug: null });
  });
});

describe("matrice sur un tournoi rattaché à une organisation", () => {
  it.each(["OWNER", "ADMIN"])("%s : lit, gère (addRound écrit), délivre un accès arbitre, voie organisateur du score", async (role) => {
    const t = await makeTournament(ORG);
    actAs(PROFILES[role]);

    expect(await requireTournamentReader(t.id)).toMatchObject({ canManage: true });
    expect(await addRound(undefined, roundForm(t.id))).toBeUndefined();
    expect(await prisma.round.count({ where: { tournamentId: t.id } })).toBe(1);
    // Garde passée : c'est la règle métier suivante (tournoi pas en cours) qui répond.
    expect(await generateRefereeAccess(t.id, "1")).toEqual({ error: "Le tournoi n'est pas en cours." });
    expect(await authorizeScoring(t.id, "match-inexistant")).toEqual({ ok: true, actor: "ORGANIZER" });
  });

  it("MEMBER : lit, mais aucune gestion, aucun accès arbitre, pas de voie organisateur", async () => {
    const t = await makeTournament(ORG);
    actAs(PROFILES.MEMBER);
    const refusal = catalogs.fr["orgAccess.managerRequired"];

    expect(await requireTournamentReader(t.id)).toMatchObject({ canManage: false });
    expect(await addRound(undefined, roundForm(t.id))).toEqual({ error: refusal });
    expect(await prisma.round.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await generateRefereeAccess(t.id, "1")).toEqual({ error: refusal });
    expect(await prisma.fieldRefereeGrant.count({ where: { tournamentId: t.id } })).toBe(0);
    // Retombe sur la session terrain (aucune ici) : jamais ORGANIZER.
    expect(await authorizeScoring(t.id, "match-inexistant")).toMatchObject({ ok: false });
  });

  it.each(["OUTSIDER", "LEGACY"])("%s : 404 en lecture et en gestion, rien d'écrit", async (profile) => {
    const t = await makeTournament(ORG);
    actAs(PROFILES[profile]);

    await expect(requireTournamentReader(t.id)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(addRound(undefined, roundForm(t.id))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateRefereeAccess(t.id, "1")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await authorizeScoring(t.id, "match-inexistant")).toMatchObject({ ok: false });
    expect(await prisma.round.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("ajout manuel d'un joueur (inscription PAID sans paiement) : OWNER oui, MEMBER refusé sans écriture", async () => {
    const t = await makeTournament(ORG);
    const form = () => {
      const fd = new FormData();
      fd.set("tournament_id", t.id);
      fd.set("players_per_team", "1");
      fd.set("player_pseudo_0", "Robin");
      return fd;
    };

    actAs(PROFILES.MEMBER);
    expect(await addPlayer(undefined, form())).toMatchObject({ error: catalogs.fr["orgAccess.managerRequired"] });
    expect(await prisma.registration.count({ where: { tournamentId: t.id } })).toBe(0);

    actAs(PROFILES.OWNER);
    expect(await addPlayer(undefined, form())).toEqual({});
    expect(await prisma.registration.count({ where: { tournamentId: t.id } })).toBe(1);
  });

  it("le créateur retiré de l'organisation perd ses droits (le créateur ne donne plus de droit)", async () => {
    const t = await makeTournament(ORG);
    actAs(PROFILES.OUTSIDER, CREATOR_ID);
    await expect(addRound(undefined, roundForm(t.id))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("tournoi hérité (sans organisation) : repli créateur", () => {
  it("le créateur, même compte hérité, garde la gestion ; les autres (même OWNER d'une organisation) non", async () => {
    const t = await makeTournament(null);

    actAs(PROFILES.LEGACY, CREATOR_ID);
    expect(await addRound(undefined, roundForm(t.id))).toBeUndefined();
    expect(await authorizeScoring(t.id, "match-inexistant")).toEqual({ ok: true, actor: "ORGANIZER" });

    actAs(PROFILES.OWNER);
    await expect(addRound(undefined, roundForm(t.id))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await prisma.round.count({ where: { tournamentId: t.id } })).toBe(1);
  });
});

describe("listes : organisation courante + tournois hérités créés, can_manage", () => {
  it("MEMBER voit les tournois de son organisation en lecture ; le créateur voit ses tournois hérités ; jamais ceux d'une autre organisation", async () => {
    const orgTournament = await makeTournament(ORG);
    const otherOrgTournament = await makeTournament(OTHER_ORG);
    const legacyMine = await makeTournament(null, "user-MEMBER");
    const legacyOther = await makeTournament(null);

    const list = await dbListTournaments({ userId: "user-MEMBER", organization: { id: ORG.id, role: "MEMBER" } });
    const ids = new Map(list.map((t) => [t.id, t.can_manage]));
    expect(ids.get(orgTournament.id)).toBe(false);
    expect(ids.get(legacyMine.id)).toBe(true);
    expect(ids.has(otherOrgTournament.id)).toBe(false);
    expect(ids.has(legacyOther.id)).toBe(false);

    const adminList = await dbListTournaments({ userId: "user-ADMIN", organization: { id: ORG.id, role: "ADMIN" } });
    expect(adminList.find((t) => t.id === orgTournament.id)?.can_manage).toBe(true);
  });

  it("tableau de bord : un brouillon de l'organisation est visible (can_view) ; celui d'une autre organisation n'apparaît pas", async () => {
    const orgDraft = await makeTournament(ORG);
    const otherDraft = await makeTournament(OTHER_ORG);

    const all = await dbListAllTournaments({ userId: "user-MEMBER", organization: { id: ORG.id, role: "MEMBER" } });
    expect(all.find((t) => t.id === orgDraft.id)).toMatchObject({ can_view: true, can_manage: false });
    expect(all.some((t) => t.id === otherDraft.id)).toBe(false);
  });
});
