import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";

/**
 * DO-OPS-001 — reassignFreeBoards() est le seul nouveau Server Action introduit par la console
 * jour J (le reste de la page n'est que lecture/composition de fonctions db* déjà existantes).
 * Prouvé contre un vrai PostgreSQL : protection organisateur (scénario obligatoire 13), effet
 * réel sur les cibles libres (mission §8, incident "cible libre alors que des matchs
 * attendent"), et non-interférence avec le reste du moteur sportif (scénarios obligatoires
 * 16-18 — recordThrow/authorizeScoring, déjà couverts en détail par leurs propres suites
 * DO-SCORING/DO-FIELD-ACCESS, revérifiés ici uniquement pour la partie qui vient de changer).
 */
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieJar.set(name, value); },
    delete: (name: string) => { cookieJar.delete(name); },
  }),
}));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));

const { prisma } = await import("@/lib/db/client");
const { dbCreateTournament, bulkCreateMatchesTx, withTournamentLock, dbRecordThrow, dbListMatchSetThrows } = await import(
  "@/lib/db/tournament"
);
const { getUser } = await import("@/lib/api/auth");
const { reassignFreeBoards } = await import("@/lib/actions/tournamentOps");
const { authorizeScoring, issueFieldSession, verifyFieldSession } = await import("@/lib/actions/fieldAccess");

const OWNER_ID = "user-ops-owner";
const OWNER = { id: OWNER_ID, email: "organisateur@example.com", roles: [], isVerified: true };

beforeEach(() => {
  cookieJar.clear();
  vi.mocked(getUser).mockReset().mockResolvedValue(OWNER as never);
});

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
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

async function makeTournament(nbBoards = 2) {
  const t = await dbCreateTournament(
    OWNER_ID,
    {
      name: "Tournoi Pilotage",
      date: "2026-09-01",
      location: "Salle des fêtes",
      max_players: 32,
      entry_fee: 0,
      nb_pools: 1,
      nb_boards: nbBoards,
      advancement_per_pool: 1,
      players_per_team: 1,
      registration_mode: "ONLINE",
      payment_mode: "ONSITE",
      scoring_mode: "TRADITIONAL",
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
      playerEmail: `${name.toLowerCase()}-${randomUUID()}@example.com`,
      playerNames: [name],
      status: "PAID",
    },
  });
}

async function makeRound(tournamentId: string) {
  const r = await prisma.round.create({
    data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" },
    select: { id: true },
  });
  return r.id;
}

let nextPosition = 5000;

async function makeMatchAt(
  tournamentId: string,
  roundIds: string[],
  boardNumber: number,
  status: "PENDING" | "IN_PROGRESS",
) {
  const p1 = await makePlayer(tournamentId, "Alice");
  const p2 = await makePlayer(tournamentId, "Bob");
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1.id,
      player2Id: p2.id,
      bracketRound: 1,
      bracketPosition: nextPosition++,
      boardNumber,
      status,
      roundIds,
      bracketType: "SINGLE",
    }]),
  );
  const match = await prisma.match.findFirstOrThrow({ where: { tournamentId, player1Id: p1.id, player2Id: p2.id } });
  const sets = await prisma.matchSet.findMany({ where: { matchId: match.id } });
  return { p1, p2, match, setId: sets[0].id };
}

describe("reassignFreeBoards — scénario obligatoire 13 (protection organisateur)", () => {
  it("refuse un visiteur non authentifié", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const t = await makeTournament();

    await expect(reassignFreeBoards(t.id)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("refuse un utilisateur authentifié mais non propriétaire de ce tournoi", async () => {
    const t = await makeTournament();
    vi.mocked(getUser).mockResolvedValue({ id: "quelqu-un-d-autre", email: "x@example.com", roles: [], isVerified: true } as never);

    await expect(reassignFreeBoards(t.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("reassignFreeBoards — mission §8 (incident 'cible libre alors que des matchs attendent')", () => {
  it("promeut un match PENDING vers la cible libre, sous le même verrou que le moteur sportif", async () => {
    const t = await makeTournament(2);
    const roundId = await makeRound(t.id);
    await makeMatchAt(t.id, [roundId], 1, "IN_PROGRESS"); // occupe la cible 1
    const { match: queued } = await makeMatchAt(t.id, [roundId], 0, "PENDING"); // en attente, cible 2 libre

    const result = await reassignFreeBoards(t.id);

    expect(result.error).toBeUndefined();
    const promoted = await prisma.match.findUniqueOrThrow({ where: { id: queued.id } });
    expect(promoted.status).toBe("IN_PROGRESS");
    expect(promoted.boardNumber).toBe(2);
  });

  it("ne fait rien s'il n'y a aucune cible libre (idempotent, jamais d'erreur)", async () => {
    const t = await makeTournament(1);
    const roundId = await makeRound(t.id);
    await makeMatchAt(t.id, [roundId], 1, "IN_PROGRESS");

    const result = await reassignFreeBoards(t.id);

    expect(result.error).toBeUndefined();
  });
});

describe("Non-régression DO-SCORING/DO-FIELD-ACCESS après reassignFreeBoards (scénarios obligatoires 16-18)", () => {
  it("un match promu par reassignFreeBoards reste parfaitement utilisable pour la saisie X01 et l'accès terrain", async () => {
    const t = await makeTournament(1);
    const roundId = await makeRound(t.id);
    const { setId, match } = await makeMatchAt(t.id, [roundId], 0, "PENDING");

    await reassignFreeBoards(t.id);
    const promoted = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(promoted.status).toBe("IN_PROGRESS");

    // DO-FIELD-ACCESS : l'autorisation terrain fonctionne normalement sur le match promu.
    const organizerAccess = await authorizeScoring(t.id, match.id);
    expect(organizerAccess).toEqual({ ok: true, actor: "ORGANIZER" });

    vi.mocked(getUser).mockResolvedValue(null);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const fieldAccess = await verifyFieldSession(t.id, match.id);
    expect(fieldAccess).toEqual({ ok: true, role: "PLAYER" });

    // DO-SCORING : la saisie d'une volée fonctionne normalement.
    const throwResult = await dbRecordThrow(setId, t.id, 1, 60, randomUUID());
    expect("error" in throwResult).toBe(false);
    expect(await dbListMatchSetThrows(setId)).toHaveLength(1);
  });
});
