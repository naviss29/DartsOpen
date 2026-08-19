import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID, randomBytes, createHash } from "crypto";

/**
 * DO-FIELD-ACCESS-002 — audit Codex : DO-FIELD-ACCESS-001 permettait une élévation PLAYER →
 * REFEREE via `?role=referee` sans aucune preuve serveur, et ne revalidait jamais le statut du
 * TOURNOI (seul le match l'était). Ce fichier prouve, contre un vrai PostgreSQL (jamais mocké),
 * que ces deux défauts sont corrigés : la preuve arbitre (`FieldRefereeGrant`) ne peut naître
 * que derrière `getOwnedTournament` (propriété réelle du tournoi), et `verifyFieldToken` refuse
 * désormais toute session dès que `tournament.status !== "IN_PROGRESS"`, indépendamment du
 * statut du match lui-même.
 *
 * `@/lib/api/auth` est mocké directement (comme `score.security.test.ts`) plutôt que simulé via
 * un cookie `ster_token` : `getUser()` y appellerait un vrai réseau vers SterPlatform, absent en
 * environnement de test. `next/headers` reste mocké par le même coffre à cookies en mémoire que
 * fieldAccess.concurrency.test.ts, pour la même raison (issueFieldSession()/verifyFieldSession()
 * hors contexte de requête Next.js réel).
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
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mercure", () => ({ publishMatchUpdate: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));

const { prisma } = await import("@/lib/db/client");
const { dbCreateTournament, bulkCreateMatchesTx, withTournamentLock } = await import("@/lib/db/tournament");
const { getUser } = await import("@/lib/api/auth");
const { generateRefereeAccess } = await import("@/lib/actions/fieldReferee");
const {
  createRefereeGrant,
  redeemRefereeGrant,
  issueFieldSession,
  verifyFieldSession,
  verifyFieldToken,
  FIELD_SESSION_COOKIE,
} = await import("@/lib/actions/fieldAccess");
const { markWinnerDirect } = await import("@/lib/actions/score");
const { arbitrateMatch } = await import("@/lib/actions/admin");

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const ORGANIZER_ID = "user-field-referee";
const ORGANIZER = { id: ORGANIZER_ID, email: "organisateur@example.com", roles: [], isVerified: true };

beforeEach(() => {
  cookieJar.clear();
  vi.mocked(getUser).mockReset().mockResolvedValue(ORGANIZER as never);
});

const createdTournamentIds: string[] = [];

afterEach(async () => {
  cookieJar.clear();
  if (createdTournamentIds.length > 0) {
    await prisma.fieldRefereeGrant.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.fieldSession.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.matchSetThrow.deleteMany({ where: { matchSet: { match: { tournamentId: { in: createdTournamentIds } } } } });
    await prisma.matchSet.deleteMany({ where: { match: { tournamentId: { in: createdTournamentIds } } } });
    await prisma.match.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.round.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.registration.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function makeTournament(overrides: Partial<Parameters<typeof dbCreateTournament>[1]> = {}) {
  const t = await dbCreateTournament(
    ORGANIZER_ID,
    {
      name: "Tournoi Field Referee",
      date: "2026-09-01",
      location: "Salle des fêtes",
      max_players: 32,
      entry_fee: 0,
      nb_pools: 1,
      nb_boards: 4,
      advancement_per_pool: 1,
      players_per_team: 1,
      registration_mode: "ONLINE",
      payment_mode: "ONSITE",
      scoring_mode: "TRADITIONAL",
      ...overrides,
    },
    randomUUID(),
  );
  createdTournamentIds.push(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  return t;
}

async function makePlayer(tournamentId: string, name: string) {
  return prisma.registration.create({
    data: {
      tournamentId,
      playerName: name,
      playerEmail: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID()}@example.com`,
      playerNames: [name],
      status: "PAID",
    },
  });
}

async function makeRound(tournamentId: string, order: number, gameType = "501") {
  const r = await prisma.round.create({
    data: { tournamentId, roundOrder: order, gameType, entryType: "SINGLE", finishType: "DOUBLE" },
    select: { id: true },
  });
  return r.id;
}

let nextBracketPosition = 1000; // plage disjointe de fieldAccess.concurrency.test.ts (fichiers indépendants)

async function makeMatchWithSets(
  tournamentId: string,
  p1Id: string,
  p2Id: string,
  roundIds: string[],
  opts: { boardNumber: number; status: "PENDING" | "IN_PROGRESS" } = { boardNumber: 1, status: "IN_PROGRESS" },
) {
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1Id,
      player2Id: p2Id,
      bracketRound: 1,
      bracketPosition: nextBracketPosition++,
      boardNumber: opts.boardNumber,
      status: opts.status,
      roundIds,
      bracketType: "SINGLE",
    }]),
  );
  const match = await prisma.match.findFirstOrThrow({ where: { tournamentId, player1Id: p1Id, player2Id: p2Id } });
  const rawSets = await prisma.matchSet.findMany({ where: { matchId: match.id }, include: { round: true } });
  const sets = rawSets.sort((a, b) => a.round.roundOrder - b.round.roundOrder);
  return { match, sets };
}

async function makeTwoRoundMatch(tournamentId: string, board: number, gameType = "501") {
  const p1 = await makePlayer(tournamentId, "Alice");
  const p2 = await makePlayer(tournamentId, "Bob");
  const round1 = await makeRound(tournamentId, 1, gameType);
  const round2 = await makeRound(tournamentId, 2, gameType);
  const { match, sets } = await makeMatchWithSets(tournamentId, p1.id, p2.id, [round1, round2], { boardNumber: board, status: "IN_PROGRESS" });
  return { p1, p2, match, setId: sets[0].id };
}

function setSessionCookie(rawToken: string) {
  cookieJar.set(FIELD_SESSION_COOKIE, rawToken);
}

describe("Scénario 1/2 — élévation ?role=referee : type confusion impossible entre les deux tables", () => {
  it("un token de session PLAYER (FieldSession) n'est jamais accepté par redeemRefereeGrant (autre table, autre hash)", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const playerToken = cookieJar.get(FIELD_SESSION_COOKIE)!;

    const redemption = await redeemRefereeGrant(playerToken, t.id);

    expect(redemption.ok).toBe(false);
  });
});

describe("Scénario 3 — génération arbitre sans organisateur authentifié : refusée", () => {
  it("generateRefereeAccess propage le refus de getOwnedTournament quand getUser() ne renvoie personne", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    void match;

    await expect(generateRefereeAccess(t.id, "1")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("un organisateur authentifié mais propriétaire d'un AUTRE tournoi est également refusé", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    void match;
    vi.mocked(getUser).mockResolvedValue({ id: "quelqu-un-d-autre", email: "x@example.com", roles: [], isVerified: true } as never);

    await expect(generateRefereeAccess(t.id, "1")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("Scénario 4/5 — génération par le propriétaire réel, preuve valide → session REFEREE", () => {
  it("generateRefereeAccess réussit pour le propriétaire réel et crée une FieldRefereeGrant persistée", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);

    const result = await generateRefereeAccess(t.id, "1");

    expect(result.error).toBeUndefined();
    expect(result.url).toContain("/field/referee?proof=");
    expect(result.qrDataUrl).toMatch(/^data:image\//);

    const grants = await prisma.fieldRefereeGrant.findMany({ where: { tournamentId: t.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0].matchId).toBe(match.id);
    expect(grants[0].usedAt).toBeNull();
  });

  it("la preuve retournée s'échange contre une vraie session REFEREE valide", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    const proof = await createRefereeGrant(t.id, match.id);

    const redemption = await redeemRefereeGrant(proof, t.id);
    expect(redemption).toEqual({ ok: true, matchId: match.id });

    await issueFieldSession(t.id, redemption.ok ? redemption.matchId : "", "REFEREE");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    const access = await verifyFieldSession(t.id, match.id);
    expect(access).toEqual({ ok: true, role: "REFEREE" });
  });

  it("une preuve déjà échangée ne peut plus jamais être rejouée (usage unique)", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    const proof = await createRefereeGrant(t.id, match.id);

    const first = await redeemRefereeGrant(proof, t.id);
    expect(first.ok).toBe(true);

    const second = await redeemRefereeGrant(proof, t.id);
    expect(second.ok).toBe(false);
  });
});

describe("Scénario 6 — preuve arbitre falsifiée : refus", () => {
  it("redeemRefereeGrant refuse un token jamais émis", async () => {
    const t = await makeTournament();
    const redemption = await redeemRefereeGrant(randomBytes(32).toString("base64url"), t.id);
    expect(redemption.ok).toBe(false);
  });
});

describe("Scénario 7 — preuve arbitre d'un autre tournoi : refus", () => {
  it("redeemRefereeGrant refuse quand le tournamentId ne correspond pas à celui de la preuve", async () => {
    const tA = await makeTournament();
    const tB = await makeTournament();
    const { match: matchA } = await makeTwoRoundMatch(tA.id, 1);
    const proof = await createRefereeGrant(tA.id, matchA.id);

    const redemption = await redeemRefereeGrant(proof, tB.id);

    expect(redemption.ok).toBe(false);
  });
});

describe("Scénario 8 — preuve arbitre d'un autre match : jamais réutilisable pour un autre match", () => {
  it("la preuve émise pour le match A résout toujours vers le match A, jamais vers le match B du même tournoi", async () => {
    const t = await makeTournament();
    const { match: matchA } = await makeTwoRoundMatch(t.id, 1);
    const { match: matchB } = await makeTwoRoundMatch(t.id, 2);
    const proofA = await createRefereeGrant(t.id, matchA.id);

    const redemption = await redeemRefereeGrant(proofA, t.id);

    expect(redemption).toEqual({ ok: true, matchId: matchA.id });
    expect(redemption.ok && redemption.matchId).not.toBe(matchB.id);
  });

  it("une preuve dont le match a depuis basculé FINISHED (cible réassignée) est refusée à l'échange", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    const proof = await createRefereeGrant(t.id, match.id);
    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED" } });

    const redemption = await redeemRefereeGrant(proof, t.id);

    expect(redemption.ok).toBe(false);
  });
});

describe("Scénario 9 — preuve arbitre expirée : refus", () => {
  it("redeemRefereeGrant refuse une FieldRefereeGrant dont expiresAt est dans le passé", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    const raw = randomBytes(32).toString("base64url");
    await prisma.fieldRefereeGrant.create({
      data: { tokenHash: hashToken(raw), tournamentId: t.id, matchId: match.id, expiresAt: new Date(Date.now() - 1000) },
    });

    const redemption = await redeemRefereeGrant(raw, t.id);

    expect(redemption.ok).toBe(false);
  });
});

describe("Scénario 10/11 — périmètre PLAYER vs REFEREE une fois la session émise", () => {
  it("une session PLAYER ne peut pas utiliser le raccourci REFEREE (markWinnerDirect X01)", async () => {
    vi.mocked(getUser).mockResolvedValue(null); // force le chemin FIELD pur, jamais organisateur
    const t = await makeTournament();
    const { p1, match, setId } = await makeTwoRoundMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await markWinnerDirect(setId, p1.id, t.id);

    expect(result.error).toBeDefined();
  });

  it("une session REFEREE valide peut utiliser les actions de scoring prévues, jamais les actions organisateur", async () => {
    vi.mocked(getUser).mockResolvedValue(null); // force le chemin FIELD pur, jamais organisateur
    const t = await makeTournament();
    const { p1, match, setId } = await makeTwoRoundMatch(t.id, 1);
    const proof = await createRefereeGrant(t.id, match.id);
    const redemption = await redeemRefereeGrant(proof, t.id);
    await issueFieldSession(t.id, redemption.ok ? redemption.matchId : "", "REFEREE");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const scoring = await markWinnerDirect(setId, p1.id, t.id);
    expect(scoring.error).toBeUndefined();

    await expect(arbitrateMatch(match.id, t.id, [])).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("Scénario 12 — tournoi FINISHED + match accidentellement IN_PROGRESS : session refusée", () => {
  it("verifyFieldToken refuse dès que le TOURNOI n'est plus IN_PROGRESS, même si le match l'est encore", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    await prisma.tournament.update({ where: { id: t.id }, data: { status: "FINISHED" } });
    // Le match, lui, reste IN_PROGRESS — incohérence délibérée pour isoler la revalidation tournoi.
    const stillInProgress = await prisma.match.findUniqueOrThrow({ where: { id: match.id }, select: { status: true } });
    expect(stillInProgress.status).toBe("IN_PROGRESS");

    const access = await verifyFieldToken(raw, t.id, match.id);

    expect(access.ok).toBe(false);
    expect(!access.ok && access.error).toMatch(/tournoi/i);
  });
});

describe("Scénario 13 — tournoi OPEN + match IN_PROGRESS incohérent : session refusée", () => {
  it("verifyFieldToken refuse quand le tournoi est OPEN (pas encore démarré) alors que le match est IN_PROGRESS", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    await prisma.tournament.update({ where: { id: t.id }, data: { status: "OPEN" } });

    const access = await verifyFieldToken(raw, t.id, match.id);

    expect(access.ok).toBe(false);
  });
});

describe("Scénario 14-18 — validation stricte de board (côté generateRefereeAccess, persistance)", () => {
  it("board=\"1abc\" → refusé, aucune FieldRefereeGrant créée", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    void match;

    const result = await generateRefereeAccess(t.id, "1abc");

    expect(result.error).toBeDefined();
    expect(await prisma.fieldRefereeGrant.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("board=\"0\" → refusé, aucune FieldRefereeGrant créée", async () => {
    const t = await makeTournament();
    const result = await generateRefereeAccess(t.id, "0");
    expect(result.error).toBeDefined();
    expect(await prisma.fieldRefereeGrant.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("board valide et réellement actif → accepté", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);

    const result = await generateRefereeAccess(t.id, "1");

    expect(result.error).toBeUndefined();
    expect((await prisma.fieldRefereeGrant.findMany({ where: { tournamentId: t.id } }))[0].matchId).toBe(match.id);
  });
});

describe("Scénario 20 — non-régression : une session PLAYER légitime reste acceptée après l'ajout de la revalidation tournoi", () => {
  it("verifyFieldSession accepte toujours une session PLAYER pour un tournoi et un match IN_PROGRESS cohérents", async () => {
    const t = await makeTournament();
    const { match } = await makeTwoRoundMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const access = await verifyFieldSession(t.id, match.id);

    expect(access).toEqual({ ok: true, role: "PLAYER" });
  });
});
