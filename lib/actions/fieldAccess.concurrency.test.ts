import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID, randomBytes, createHash } from "crypto";

/**
 * DO-FIELD-ACCESS-001 — les 20 scénarios obligatoires de la mission, prouvés contre un vrai
 * PostgreSQL (jamais mocké) partout où la persistance intervient, même discipline que les
 * fichiers *.concurrency.test.ts précédents (DO-SPORT-001/002, DO-SCORING-001/002/003).
 *
 * `next/headers` est mocké par un petit coffre à cookies en mémoire (aucun précédent dans ce
 * dépôt avant cette mission — confirmé par recherche avant d'écrire ce fichier) : c'est le seul
 * moyen d'exercer la vraie chaîne issueFieldSession() → cookie → verifyFieldSession() sans
 * contexte de requête Next.js réel. `next/navigation` et `next/cache` sont mockés pour la même
 * raison que dans score.security.test.ts (redirect()/notFound()/revalidatePath() n'ont de sens
 * que dans une vraie requête Next.js). Rien d'autre n'est mocké : lib/actions/fieldAccess.ts,
 * lib/actions/score.ts, lib/actions/admin.ts, lib/actions/scoreAuthorization.ts et lib/api/auth.ts
 * tournent tous en code réel contre la base réelle.
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

const { prisma } = await import("@/lib/db/client");
const { dbCreateTournament, dbListMatchSetThrows, bulkCreateMatchesTx, withTournamentLock } = await import(
  "@/lib/db/tournament"
);
const {
  issueFieldSession,
  verifyFieldSession,
  verifyFieldToken,
  createFieldSessionToken,
  authorizeScoring,
  canMarkWinnerDirect,
  FIELD_SESSION_COOKIE,
} = await import("@/lib/actions/fieldAccess");
const { recordThrow, cancelLastThrow, markWinnerDirect, proposeWinner } = await import("@/lib/actions/score");
const { arbitrateMatch } = await import("@/lib/actions/admin");

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

beforeEach(() => {
  cookieJar.clear();
});

const createdTournamentIds: string[] = [];

afterEach(async () => {
  cookieJar.clear();
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

async function makeTournament(overrides: Partial<Parameters<typeof dbCreateTournament>[1]> = {}) {
  const t = await dbCreateTournament(
    "user-field-access",
    {
      name: "Tournoi Field Access",
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

// Un même board peut légitimement porter plusieurs matchs successifs au cours d'un même test
// (scénario 10 : ancien match terminé puis nouveau match promu sur la même cible) — la
// contrainte d'unicité réelle porte sur (tournament_id, bracket_type, bracket_round,
// bracket_position), jamais sur le numéro de cible. Un compteur dédié, indépendant du board,
// garantit une bracket_position toujours neuve.
let nextBracketPosition = 0;

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

/** Match X01 minimal (1 set) : suffisant pour recordThrow/cancelLastThrow, jamais assez pour
 * terminer le match tout seul (pas de round supplémentaire), donc jamais de déclenchement de
 * doAdvanceToNextRound ici — hors périmètre de ce fichier, déjà couvert par DO-SPORT/DO-SCORING. */
async function makeSimpleMatch(tournamentId: string, board: number, gameType = "501") {
  const p1 = await makePlayer(tournamentId, "Alice");
  const p2 = await makePlayer(tournamentId, "Bob");
  const roundId = await makeRound(tournamentId, 1, gameType);
  const { match, sets } = await makeMatchWithSets(tournamentId, p1.id, p2.id, [roundId], { boardNumber: board, status: "IN_PROGRESS" });
  return { p1, p2, match, setId: sets[0].id };
}

/** Match à 2 manches : une désignation directe de gagnant (markWinnerDirect) sur la première
 * manche ne termine donc jamais le match, évitant tout effet de bord de progression sportive
 * hors périmètre (comparaison de rôles PLAYER/REFEREE uniquement). */
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

describe("Scénario 1 — QR/cible avec match actif : la session émise est valide pour ce match", () => {
  it("verifyFieldSession accepte une session tout juste émise pour le match IN_PROGRESS ciblé", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);

    await issueFieldSession(t.id, match.id, "PLAYER");
    const access = await verifyFieldSession(t.id, match.id);

    expect(access).toEqual({ ok: true, role: "PLAYER" });
  });
});

describe("Scénario 2 — cible sans match : voir app/(public)/t/[id]/field/route.test.ts (aucune session émise)", () => {
  it("note de couverture — pas de logique de persistance propre à ce scénario, déjà prouvé côté route", () => {
    expect(true).toBe(true);
  });
});

describe("Scénario 3 — session valide : scoring autorisé", () => {
  it("authorizeScoring retourne un accès FIELD pour une session valide, sans compte organisateur", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const access = await authorizeScoring(t.id, match.id);

    expect(access).toEqual({ ok: true, actor: "FIELD", role: "PLAYER" });
  });
});

describe("Scénario 4 — session expirée : refusée", () => {
  it("verifyFieldToken refuse une session dont expiresAt est dans le passé", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);
    const raw = randomBytes(32).toString("base64url");
    await prisma.fieldSession.create({
      data: { tokenHash: hashToken(raw), tournamentId: t.id, matchId: match.id, role: "PLAYER", expiresAt: new Date(Date.now() - 1000) },
    });

    const access = await verifyFieldToken(raw, t.id, match.id);

    expect(access.ok).toBe(false);
    expect(!access.ok && access.error).toMatch(/expir/i);
  });
});

describe("Scénario 5 — session d'un autre tournoi : refusée", () => {
  it("verifyFieldToken refuse quand le tournamentId ne correspond pas à celui de la session", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    const access = await verifyFieldToken(raw, randomUUID(), match.id);

    expect(access.ok).toBe(false);
  });
});

describe("Scénario 6 — session d'une autre cible (autre match) : refusée", () => {
  it("verifyFieldToken refuse une session valide utilisée pour un AUTRE match, réel et actif, du même tournoi", async () => {
    const t = await makeTournament();
    const { match: matchA } = await makeSimpleMatch(t.id, 1);
    const { match: matchB } = await makeSimpleMatch(t.id, 2);
    await issueFieldSession(t.id, matchA.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    const access = await verifyFieldToken(raw, t.id, matchB.id);

    expect(access.ok).toBe(false);
  });
});

describe("Scénario 7 — session d'un autre match : refusée (chaîne complète via score.ts)", () => {
  it("recordThrow refuse une volée sur un match différent de celui pour lequel la session a été émise", async () => {
    const t = await makeTournament();
    const { match: matchA } = await makeSimpleMatch(t.id, 1);
    const { setId: setIdB } = await makeSimpleMatch(t.id, 2);
    await issueFieldSession(t.id, matchA.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await recordThrow(setIdB, t.id, 1, 60, randomUUID());

    expect(result.error).toBeDefined();
    expect(await dbListMatchSetThrows(setIdB)).toHaveLength(0);
  });
});

describe("Scénario 8 — modification manuelle de matchId (via matchSetId) : refusée", () => {
  it("cancelLastThrow refuse quand le matchSetId transmis appartient réellement à un autre match que celui de la session", async () => {
    const t = await makeTournament();
    const { match: matchA } = await makeSimpleMatch(t.id, 1);
    const { setId: setIdB } = await makeSimpleMatch(t.id, 2);
    await issueFieldSession(t.id, matchA.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await cancelLastThrow(setIdB, t.id, randomUUID());

    expect(result.error).toBeDefined();
  });
});

describe("Scénario 9 — ancien match terminé : refusé", () => {
  it("verifyFieldToken refuse une session dont le match référencé est passé à FINISHED entre-temps", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED" } });
    const access = await verifyFieldToken(raw, t.id, match.id);

    expect(access.ok).toBe(false);
    expect(!access.ok && access.error).toMatch(/plus actif/i);
  });
});

describe("Scénario 10 — nouveau match assigné à la même cible : l'ancienne session devient invalide", () => {
  it("une session émise pour l'ancien match ne s'applique ni à l'ancien match terminé ni au nouveau match promu sur la même cible", async () => {
    const t = await makeTournament();
    const { match: oldMatch } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, oldMatch.id, "PLAYER");
    const raw = cookieJar.get(FIELD_SESSION_COOKIE)!;

    await prisma.match.update({ where: { id: oldMatch.id }, data: { status: "FINISHED" } });
    const { match: newMatch } = await makeSimpleMatch(t.id, 1);

    const onOldMatch = await verifyFieldToken(raw, t.id, oldMatch.id);
    const onNewMatch = await verifyFieldToken(raw, t.id, newMatch.id);

    expect(onOldMatch.ok).toBe(false);
    expect(onNewMatch.ok).toBe(false);
  });
});

describe("Scénario 11 — une session joueur ne peut jamais appeler une action organisateur", () => {
  it("arbitrateMatch reste réservé à getOwnedTournament : une session terrain valide (même REFEREE) ne l'atteint jamais", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "REFEREE");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    // Aucun cookie ster_token posé : getUser() (lib/api/auth.ts) renvoie null sans réseau.

    await expect(arbitrateMatch(match.id, t.id, [])).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("Scénario 12 — une session joueur ne peut pas arbitrer/désigner manuellement le vainqueur (mode X01)", () => {
  it("markWinnerDirect refuse le raccourci X01 pour un rôle PLAYER, l'accepte pour REFEREE", async () => {
    const t = await makeTournament();
    const { p1, match, setId } = await makeTwoRoundMatch(t.id, 1, "501");

    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    const asPlayer = await markWinnerDirect(setId, p1.id, t.id);
    expect(asPlayer.error).toBeDefined();

    cookieJar.clear();
    await issueFieldSession(t.id, match.id, "REFEREE");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    const asReferee = await markWinnerDirect(setId, p1.id, t.id);
    expect(asReferee.error).toBeUndefined();
  });
});

describe("Scénario 13 — saisie X01 normale sans compte SterPlatform", () => {
  it("recordThrow persiste une volée avec une seule session terrain PLAYER, aucun getUser()/compte requis", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1, "501");
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await recordThrow(setId, t.id, 1, 60, randomUUID());

    expect(result.error).toBeUndefined();
    const throwsRows = await dbListMatchSetThrows(setId);
    expect(throwsRows).toHaveLength(1);
    expect(throwsRows[0].remaining_after).toBe(441);
  });
});

describe("Scénario 14 — saisie électronique selon le nouveau modèle (sans compte)", () => {
  it("proposeWinner accepte une déclaration terrain (session valide) pour un joueur réel du match, sans utilisateur SterPlatform", async () => {
    const t = await makeTournament();
    const { p1, match, setId } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await proposeWinner(setId, p1.id, 1, t.id);

    expect(result.error).toBeUndefined();
  });

  it("proposeWinner refuse toujours un winnerId étranger au match, même avec une session terrain valide", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await proposeWinner(setId, "reg-intrus", 1, t.id);

    expect(result.error).toBeDefined();
  });
});

describe("Scénario 15 — saisie Cricket selon le nouveau modèle", () => {
  it("markWinnerDirect (désignation directe, seule voie de saisie Cricket) est autorisé pour une session terrain PLAYER", async () => {
    const t = await makeTournament();
    const { p1, setId } = await makeTwoRoundMatch(t.id, 1, "CRICKET");
    const { match } = await makeTwoRoundMatch(t.id, 2, "CRICKET"); // évite toute interférence de session
    void match;
    await issueFieldSession(t.id, (await prisma.matchSet.findUniqueOrThrow({ where: { id: setId }, select: { matchId: true } })).matchId, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await markWinnerDirect(setId, p1.id, t.id);

    expect(result.error).toBeUndefined();
  });
});

describe("Scénario 16 — annulation de la dernière volée : autorisée pour la session terrain retenue", () => {
  it("cancelLastThrow réussit pour une session PLAYER après une volée qu'elle a elle-même saisie", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    await recordThrow(setId, t.id, 1, 60, randomUUID());

    const result = await cancelLastThrow(setId, t.id, randomUUID());

    expect(result.error).toBeUndefined();
    // DO-SCORING-001 — une volée annulée reste en base, marquée cancelled (traçabilité),
    // jamais supprimée physiquement : la protection à vérifier ici est l'autorisation
    // terrain, pas la mécanique d'annulation elle-même (déjà couverte ailleurs).
    const throwsRows = await dbListMatchSetThrows(setId);
    expect(throwsRows).toHaveLength(1);
    expect(throwsRows[0].cancelled).toBe(true);
  });

  it("cancelLastThrow refuse sans session terrain valide ni organisateur", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);
    await recordThrow(setId, t.id, 1, 60, randomUUID());
    cookieJar.clear(); // la session n'est plus présentée par ce visiteur

    const result = await cancelLastThrow(setId, t.id, randomUUID());

    expect(result.error).toBeDefined();
  });
});

describe("Scénario 17 — token invalide/aléatoire : refusé", () => {
  it("verifyFieldToken refuse un token jamais émis (aucune ligne ne correspond au hash)", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);

    const access = await verifyFieldToken(randomBytes(32).toString("base64url"), t.id, match.id);

    expect(access.ok).toBe(false);
  });

  it("verifyFieldToken refuse l'absence de token", async () => {
    const t = await makeTournament();
    const { match } = await makeSimpleMatch(t.id, 1);

    const access = await verifyFieldToken(undefined, t.id, match.id);

    expect(access.ok).toBe(false);
  });
});

describe("Scénario 18 — token réutilisé hors de son périmètre : refusé bout en bout", () => {
  it("proposeWinner refuse une session valide mais présentée pour un match du tournoi qui n'est pas le sien", async () => {
    const t = await makeTournament();
    const { match: matchA } = await makeSimpleMatch(t.id, 1);
    const { setId: setIdB } = await makeSimpleMatch(t.id, 2);
    await issueFieldSession(t.id, matchA.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    const result = await proposeWinner(setIdB, "reg-x", 1, t.id);

    expect(result.error).toBeDefined();
  });
});

describe("Scénario 19 — expiration concurrente avec la saisie : état cohérent, jamais partiel", () => {
  it("une session déjà expirée au moment de l'appel refuse recordThrow sans laisser de volée orpheline", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1);
    const raw = await createFieldSessionToken(t.id, match.id, "PLAYER");
    await prisma.fieldSession.update({ where: { tokenHash: hashToken(raw) }, data: { expiresAt: new Date(Date.now() - 1) } });
    setSessionCookie(raw);

    const result = await recordThrow(setId, t.id, 1, 60, randomUUID());

    expect(result.error).toBeDefined();
    expect(await dbListMatchSetThrows(setId)).toHaveLength(0);
  });
});

describe("Scénario 20 — match terminé pendant la saisie : les protections DO-SPORT/DO-SCORING restent respectées", () => {
  it("recordThrow refuse dès la revalidation dynamique du statut du match, sans jamais atteindre dbRecordThrow", async () => {
    const t = await makeTournament();
    const { match, setId } = await makeSimpleMatch(t.id, 1);
    await issueFieldSession(t.id, match.id, "PLAYER");
    setSessionCookie(cookieJar.get(FIELD_SESSION_COOKIE)!);

    // Simule une fin de match survenue par un autre chemin (ex. progression DO-SPORT déclenchée
    // ailleurs) pendant que ce visiteur détient encore une session techniquement non expirée.
    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED" } });

    const result = await recordThrow(setId, t.id, 1, 60, randomUUID());

    expect(result.error).toBeDefined();
    expect(await dbListMatchSetThrows(setId)).toHaveLength(0);
  });
});

describe("canMarkWinnerDirect — cohérence pure (utilisée par l'UI et par score.ts)", () => {
  it("organisateur et arbitre terrain toujours autorisés, joueur terrain uniquement en Cricket", () => {
    expect(canMarkWinnerDirect({ ok: true, actor: "ORGANIZER" }, "501")).toBe(true);
    expect(canMarkWinnerDirect({ ok: true, actor: "FIELD", role: "REFEREE" }, "501")).toBe(true);
    expect(canMarkWinnerDirect({ ok: true, actor: "FIELD", role: "PLAYER" }, "501")).toBe(false);
    expect(canMarkWinnerDirect({ ok: true, actor: "FIELD", role: "PLAYER" }, "CRICKET")).toBe(true);
  });
});
