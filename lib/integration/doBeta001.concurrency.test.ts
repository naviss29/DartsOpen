import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";

/**
 * DO-BETA-001 — répétition générale de bêta terrain : reproduit, avec les VRAIES fonctions/
 * Server Actions déjà validées individuellement par DO-SPORT/DO-SCORING/DO-FIELD-ACCESS/DO-OPS,
 * le parcours complet d'un tournoi réel (8 joueurs, 2 cibles, mode standard, X01 traditionnel,
 * plusieurs manches par match) — de la création au classement final, contre un vrai PostgreSQL.
 *
 * Objectif : détecter des défauts d'INTÉGRATION entre les briques (déjà chacune correcte
 * individuellement), pas re-tester leur logique interne. Aucune donnée n'est fabriquée par
 * `UPDATE` SQL brut pour simuler un état — seules les identités/inscriptions (équivalent d'un
 * parcours SSO/inscription externe disproportionné à automatiser ici) le sont, via Prisma direct,
 * exactement comme dans tous les fichiers *.concurrency.test.ts précédents.
 *
 * "Appareils" distincts = coffres à cookies en mémoire indépendants (même modèle que
 * fieldAccess.concurrency.test.ts) : un visiteur ne "voit" que son propre cookie de session
 * terrain, jamais celui d'un autre — c'est la seule notion d'"appareil" pertinente pour DO-FIELD-
 * ACCESS (les sessions ne sont jamais liées à un fingerprint matériel).
 */

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));

// Coffre à cookies = appareil. Un `Map` vide et indépendant par appareil conceptuel.
function newDeviceJar(): Map<string, string> {
  return new Map<string, string>();
}

// `next/headers` est un singleton mocké au niveau module : on route dynamiquement vers le
// coffre "actif" (celui de l'appareil qui effectue l'appel courant) — setActiveDevice() ci-dessous.
let activeJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (activeJar.has(name) ? { name, value: activeJar.get(name)! } : undefined),
    set: (name: string, value: string) => { activeJar.set(name, value); },
    delete: (name: string) => { activeJar.delete(name); },
  }),
}));

const { prisma } = await import("@/lib/db/client");
const {
  dbCreateTournament,
  dbListMatches,
  dbListMatchSetThrows,
  dbGetTournamentPublic,
} = await import("@/lib/db/tournament");
const { getUser } = await import("@/lib/api/auth");
const { updateTournamentStatus } = await import("@/lib/actions/tournament");
const { generateBracket } = await import("@/lib/actions/bracket");
const { generateQuickBracket } = await import("@/lib/actions/quickTournament");
const { recordThrow, cancelLastThrow, markWinnerDirect } = await import("@/lib/actions/score");
const { arbitrateMatch } = await import("@/lib/actions/admin");
const {
  issueFieldSession,
  verifyFieldSession,
  redeemRefereeGrant,
  FIELD_SESSION_COOKIE,
} = await import("@/lib/actions/fieldAccess");
const { generateRefereeAccess } = await import("@/lib/actions/fieldReferee");
const { reassignFreeBoards } = await import("@/lib/actions/tournamentOps");
const { loadTournamentConsoleData } = await import("@/lib/ops/loadConsoleData");
const {
  buildConsoleSummary,
  buildReadinessChecklist,
  buildNextAction,
  buildBoardsView,
  buildMatchQueue,
  detectIncidents,
} = await import("@/lib/ops/tournamentConsole");
const { publishMatchUpdate } = await import("@/lib/mercure");
const { computeRemaining, computeActivePlayer } = await import("@/lib/utils/x01");

const OWNER_ID = "user-beta-001";
const OWNER = { id: OWNER_ID, email: "organisateur@example.com", roles: [], isVerified: true };
const STRANGER = { id: "user-stranger", email: "intrus@example.com", roles: [], isVerified: true };

function asOrganizer() {
  vi.mocked(getUser).mockResolvedValue(OWNER as never);
}
function asAnonymous() {
  vi.mocked(getUser).mockResolvedValue(null);
}
function asStranger() {
  vi.mocked(getUser).mockResolvedValue(STRANGER as never);
}

/** Bascule "l'appareil actif" : chaque appel à cookies() après ceci lit/écrit CE coffre.
 * (Nommée sans le préfixe `use` : ce n'est pas un Hook React, seulement une convention de nom
 * que le linter react-hooks confondrait sinon avec un vrai Hook.) */
function setActiveDevice(jar: Map<string, string>) {
  activeJar = jar;
}

const createdTournamentIds: string[] = [];

beforeAll(() => {
  asOrganizer();
});

afterAll(async () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// État partagé entre les it() séquentiels de cette répétition générale.
// ─────────────────────────────────────────────────────────────────────────────
let tournamentId: string;
const players: { id: string; player_name: string }[] = [];
let boardOneMatchId: string;
let boardTwoMatchId: string;
let boardOneSet1Id: string;
let boardOneSet2Id: string;

describe("DO-BETA-001 — répétition générale : parcours bêta terrain complet", () => {
  it("1-2. création et configuration du tournoi (mode standard, 2 cibles, X01 traditionnel, 2 manches)", async () => {
    asOrganizer();
    const t = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Bêta Terrain",
        date: "2026-09-05",
        location: "Salle des fêtes de Beta-sur-Seine",
        max_players: 8,
        entry_fee: 0,
        nb_pools: 1,
        nb_boards: 2,
        advancement_per_pool: 1,
        players_per_team: 1,
        registration_mode: "ONLINE",
        payment_mode: "ONSITE",
        scoring_mode: "TRADITIONAL",
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    tournamentId = t.id;
    expect(t.status).toBe("DRAFT");

    // Deux manches X01 501 double-sortie : un match nécessite de gagner LES DEUX manches pour se
    // terminer (jamais une seule) — condition réaliste pour exercer un vrai changement de manche.
    await prisma.round.create({ data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" } });
    await prisma.round.create({ data: { tournamentId, roundOrder: 2, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" } });
  });

  it("3. inscriptions — 8 joueurs réellement engagés (PAID)", async () => {
    for (let i = 1; i <= 8; i++) {
      const p = await prisma.registration.create({
        data: {
          tournamentId,
          playerName: `BêtaJoueur${i}`,
          playerEmail: `joueur${i}-${randomUUID()}@example.com`,
          playerNames: [`BêtaJoueur${i}`],
          status: "PAID",
        },
      });
      players.push({ id: p.id, player_name: p.playerName });
    }
    expect(players).toHaveLength(8);
  });

  it("4. ouverture des inscriptions (DRAFT → OPEN, transition serveur réelle)", async () => {
    await updateTournamentStatus(tournamentId, "OPEN");
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(t.status).toBe("OPEN");
  });

  it("5. Pilotage AVANT démarrage — checklist prête, prochaine action = démarrer", async () => {
    const tournament = await dbGetTournamentPublic(tournamentId) as never as {
      status: string; quick_mode: boolean; scoring_mode: string; nb_boards: number; nb_pools: number; max_players: number; players_per_team: number;
    };
    const { registrations, pools, matches } = await loadTournamentConsoleData(tournamentId);
    const checklist = buildReadinessChecklist(tournament, registrations, pools);
    const summary = buildConsoleSummary(tournament, registrations, matches);
    const nextAction = buildNextAction(tournamentId, tournament, checklist, summary, pools, detectIncidents(tournament, matches));

    expect(checklist.find((c) => c.id === "registrations")!.level).toBe("ok");
    expect(checklist.some((c) => c.level === "blocking")).toBe(false);
    expect(summary.confirmedPlayerCount).toBe(8);
    expect(nextAction.id).toBe("start");
  });

  it("6-7. génération du bracket (parcours normal poule unique = bracket direct) puis démarrage (OPEN → IN_PROGRESS)", async () => {
    // Poule unique (nb_pools=1) : le parcours normal est le bracket direct, sans étape de
    // génération de poules — cohérent avec la checklist DO-OPS (item "bracket-auto").
    const genResult = await generateBracket(tournamentId);
    expect(genResult.error).toBeUndefined();

    await updateTournamentStatus(tournamentId, "IN_PROGRESS");
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(t.status).toBe("IN_PROGRESS");

    const matches = await dbListMatches(tournamentId);
    const round1 = matches.filter((m) => m.bracket_round === 1);
    expect(round1).toHaveLength(4); // 8 joueurs → 4 quarts de finale
    const active = round1.filter((m) => m.status === "IN_PROGRESS");
    const pending = round1.filter((m) => m.status === "PENDING");
    expect(active).toHaveLength(2); // exactement nb_boards matchs démarrent
    expect(pending).toHaveLength(2); // le reste attend une cible libre

    boardOneMatchId = active.find((m) => m.board_number === 1)!.id;
    boardTwoMatchId = active.find((m) => m.board_number === 2)!.id;
    expect(boardOneMatchId).toBeDefined();
    expect(boardTwoMatchId).toBeDefined();

    const setsBoardOne = await prisma.matchSet.findMany({ where: { matchId: boardOneMatchId }, include: { round: true } });
    const sortedSets = setsBoardOne.sort((a, b) => a.round.roundOrder - b.round.roundOrder);
    boardOneSet1Id = sortedSets[0].id;
    boardOneSet2Id = sortedSets[1].id;
  });

  it("8. Pilotage APRÈS démarrage — cibles actives cohérentes avec la réalité DB", async () => {
    const tournament = await dbGetTournamentPublic(tournamentId) as never as {
      status: string; quick_mode: boolean; scoring_mode: string; nb_boards: number; nb_pools: number; max_players: number; players_per_team: number;
    };
    const { matches } = await loadTournamentConsoleData(tournamentId);
    const boards = buildBoardsView(tournament, matches);
    const queue = buildMatchQueue(matches);

    expect(boards).toHaveLength(2);
    expect(boards.every((b) => b.status === "active")).toBe(true);
    expect(boards.find((b) => b.board === 1)!.match!.id).toBe(boardOneMatchId);
    expect(boards.find((b) => b.board === 2)!.match!.id).toBe(boardTwoMatchId);
    expect(queue).toHaveLength(2); // les 2 quarts de finale encore en attente

    const summary = buildConsoleSummary(tournament, [], matches);
    expect(summary.matchesInProgress).toBe(2);
    expect(summary.matchesPending).toBe(2);
  });

  // ── Cible 1 : scan QR, deux appareils, saisie X01 réelle (bust/checkout/manche/annulation) ──

  const deviceA = newDeviceJar(); // premier téléphone posé à la cible 1
  const deviceB = newDeviceJar(); // second téléphone posé à la MÊME cible 1
  const deviceNewScan = newDeviceJar(); // nouveau scan après changement de match sur la cible 1

  async function realThrow(
    jar: Map<string, string>,
    setId: string,
    player: 1 | 2,
    score: number,
    checkoutDart: { segment: number; multiplier: 1 | 2 | 3 } | null = null,
    clientRequestId?: string,
  ) {
    setActiveDevice(jar);
    const result = await recordThrow(setId, tournamentId, player, score, clientRequestId ?? randomUUID(), checkoutDart);
    expect(result.error).toBeUndefined();
    return result;
  }

  it("9-10. scan QR cible 1 par DEUX appareils distincts → deux sessions PLAYER valides pour le même match", async () => {
    // DO-BETA-001 — à partir d'ici, `getUser()` ne renvoie plus l'organisateur : toute la
    // saisie X01 qui suit (bust/checkout/annulation/double-soumission/promotion) doit être
    // AUTORISÉE PAR LA SEULE SESSION TERRAIN, exactement le parcours réel d'un joueur qui
    // scanne le QR sans jamais s'authentifier auprès de SterPlatform (DO-FIELD-ACCESS). Sans
    // ceci, authorizeScoring() aurait silencieusement laissé passer chaque appel via le repli
    // organisateur (toujours prioritaire) sans jamais exercer réellement le chemin terrain —
    // ce que la première version de ce scénario avait, à tort, laissé faire.
    asAnonymous();
    setActiveDevice(deviceA);
    await issueFieldSession(tournamentId, boardOneMatchId, "PLAYER");
    expect(deviceA.has(FIELD_SESSION_COOKIE)).toBe(true);

    setActiveDevice(deviceB);
    await issueFieldSession(tournamentId, boardOneMatchId, "PLAYER");
    expect(deviceB.has(FIELD_SESSION_COOKIE)).toBe(true);
    expect(deviceB.get(FIELD_SESSION_COOKIE)).not.toBe(deviceA.get(FIELD_SESSION_COOKIE));

    setActiveDevice(deviceA);
    expect(await verifyFieldSession(tournamentId, boardOneMatchId)).toEqual({ ok: true, role: "PLAYER" });
    setActiveDevice(deviceB);
    expect(await verifyFieldSession(tournamentId, boardOneMatchId)).toEqual({ ok: true, role: "PLAYER" });
  });

  it("11-14. manche 1 — volées réelles, bust, annulation après bust, double-soumission concurrente, checkout valide", async () => {
    // Joueur 1 saisi depuis l'appareil A, joueur 2 depuis l'appareil B — le modèle "cible
    // partagée" de DO-FIELD-ACCESS : les deux sessions sont valides simultanément.
    await realThrow(deviceA, boardOneSet1Id, 1, 100); // 501 → 401
    await realThrow(deviceB, boardOneSet1Id, 2, 100); // 501 → 401

    await realThrow(deviceA, boardOneSet1Id, 1, 100); // 401 → 301
    await realThrow(deviceB, boardOneSet1Id, 2, 100); // 401 → 301

    // Refresh mi-manche : l'état reconstruit depuis l'historique persisté doit correspondre.
    const midThrows = await dbListMatchSetThrows(boardOneSet1Id);
    const matchAfterStart = await prisma.match.findUniqueOrThrow({ where: { id: boardOneMatchId } });
    const remainingP1 = computeRemaining(midThrows, matchAfterStart.player1Id, 501);
    const remainingP2 = computeRemaining(midThrows, matchAfterStart.player2Id!, 501);
    expect(remainingP1).toBe(301);
    expect(remainingP2).toBe(301);
    expect(computeActivePlayer(midThrows, matchAfterStart.player1Id, matchAfterStart.player2Id!)).toBe(matchAfterStart.player1Id);

    await realThrow(deviceA, boardOneSet1Id, 1, 100); // 301 → 201
    await realThrow(deviceB, boardOneSet1Id, 2, 180); // 301 → 121
    await realThrow(deviceA, boardOneSet1Id, 1, 100); // 201 → 101
    await realThrow(deviceB, boardOneSet1Id, 2, 100); // 121 → 21
    await realThrow(deviceA, boardOneSet1Id, 1, 61);  // 101 → 40

    // 12. BUST réel : joueur 2 est à 21, une volée de 22 est impossible (passerait sous zéro).
    setActiveDevice(deviceB);
    const bustResult = await recordThrow(boardOneSet1Id, tournamentId, 2, 22, randomUUID());
    expect(bustResult.error).toBeUndefined();
    expect(bustResult.bust).toBe(true);

    // Annulation APRÈS un bust : aucune conséquence sportive propagée par un bust, donc
    // l'annulation doit réussir et le restant du joueur 2 doit rester inchangé (21).
    const cancelBust = await cancelLastThrow(boardOneSet1Id, tournamentId, randomUUID());
    expect(cancelBust.error).toBeUndefined();
    const afterCancelBust = await dbListMatchSetThrows(boardOneSet1Id);
    expect(computeRemaining(afterCancelBust, matchAfterStart.player2Id!, 501)).toBe(21);

    await realThrow(deviceB, boardOneSet1Id, 2, 5); // 21 → 16 (rejoue après l'annulation)

    // Double-soumission CONCURRENTE (même clientRequestId, deux appels en parallèle) : la
    // checkout de joueur 1 (40, double 20) ne doit être appliquée qu'UNE seule fois.
    const sharedRequestId = randomUUID();
    setActiveDevice(deviceA);
    const [c1, c2] = await Promise.all([
      recordThrow(boardOneSet1Id, tournamentId, 1, 40, sharedRequestId, { segment: 20, multiplier: 2 }),
      recordThrow(boardOneSet1Id, tournamentId, 1, 40, sharedRequestId, { segment: 20, multiplier: 2 }),
    ]);
    expect(c1.error).toBeUndefined();
    expect(c2.error).toBeUndefined();

    const set1Final = await prisma.matchSet.findUniqueOrThrow({ where: { id: boardOneSet1Id } });
    expect(set1Final.winnerId).toBe(matchAfterStart.player1Id);

    const p1Throws = (await dbListMatchSetThrows(boardOneSet1Id)).filter(
      (t) => t.player_id === matchAfterStart.player1Id && !t.cancelled && t.score_entered === 40
    );
    expect(p1Throws).toHaveLength(1); // jamais deux volées de checkout malgré les deux appels concurrents

    // Constat réel (répétition générale) : tant que la manche 2 n'a reçu AUCUNE volée, la
    // checkout de la manche 1 reste annulable (dbCancelLastThrow — DO-SCORING-002 Étape 3 :
    // "si aucune manche suivante n'a commencé"). C'est un comportement voulu, pas un défaut —
    // le refus n'intervient qu'une fois le MATCH terminé (voir le test suivant) ou dès que la
    // manche suivante a elle-même commencé. Vérifié ici puis annulation immédiatement rejouée
    // pour laisser l'état correct à la suite du scénario.
    const cancelStillOpenSet = await cancelLastThrow(boardOneSet1Id, tournamentId, randomUUID());
    expect(cancelStillOpenSet.error).toBeUndefined();
    const set1AfterUndo = await prisma.matchSet.findUniqueOrThrow({ where: { id: boardOneSet1Id } });
    expect(set1AfterUndo.winnerId).toBeNull(); // la checkout annulée a bien rouvert la manche

    await realThrow(deviceA, boardOneSet1Id, 1, 40, { segment: 20, multiplier: 2 }); // rejoue la même checkout
    const set1Redone = await prisma.matchSet.findUniqueOrThrow({ where: { id: boardOneSet1Id } });
    expect(set1Redone.winnerId).toBe(matchAfterStart.player1Id);
  });

  it("14 (suite). changement de manche — la manche 2 se joue normalement, le match se termine au 2e checkout", async () => {
    const match = await prisma.match.findUniqueOrThrow({ where: { id: boardOneMatchId } });
    expect(match.status).toBe("IN_PROGRESS"); // une seule manche gagnée ne termine jamais le match (2 manches requises)

    await realThrow(deviceA, boardOneSet2Id, 1, 100); // 501 → 401
    await realThrow(deviceB, boardOneSet2Id, 2, 100); // 501 → 401
    await realThrow(deviceA, boardOneSet2Id, 1, 100); // 401 → 301
    await realThrow(deviceB, boardOneSet2Id, 2, 100); // 401 → 301
    await realThrow(deviceA, boardOneSet2Id, 1, 100); // 301 → 201
    await realThrow(deviceB, boardOneSet2Id, 2, 180); // 301 → 121
    await realThrow(deviceA, boardOneSet2Id, 1, 100); // 201 → 101
    await realThrow(deviceB, boardOneSet2Id, 2, 100); // 121 → 21
    await realThrow(deviceA, boardOneSet2Id, 1, 61);  // 101 → 40
    await realThrow(deviceB, boardOneSet2Id, 2, 5);   // 21 → 16

    // 13/15-17. checkout final : gagne la manche 2 (2-0), termine le match, libère la cible,
    // et — dans LA MÊME transaction (DO-SCORING-002) — promeut un match en attente sur la cible libérée.
    await realThrow(deviceA, boardOneSet2Id, 1, 40, { segment: 20, multiplier: 2 });

    const finishedMatch = await prisma.match.findUniqueOrThrow({ where: { id: boardOneMatchId } });
    expect(finishedMatch.status).toBe("FINISHED");
    expect(finishedMatch.winnerId).toBe(match.player1Id);

    // Refus d'annulation (§11) : cette fois le MATCH est réellement terminé — sa conséquence
    // sportive (cible libérée, promotion éventuelle) a été propagée. cancelLastThrow doit
    // désormais refuser, sur la manche qui vient de clôturer le match.
    const refusedAfterMatchFinished = await cancelLastThrow(boardOneSet2Id, tournamentId, randomUUID());
    expect(refusedAfterMatchFinished.error).toBeDefined();

    const boardOneNow = await prisma.match.findFirst({ where: { tournamentId, boardNumber: 1, status: "IN_PROGRESS" } });
    expect(boardOneNow).not.toBeNull();
    expect(boardOneNow!.id).not.toBe(boardOneMatchId); // un AUTRE match a été promu sur la cible libérée
    boardOneMatchId = boardOneNow!.id; // devient "le nouveau match de la cible 1" pour la suite
  });

  it("18-19. l'ANCIENNE session (match terminé) est invalidée sur le nouveau match ; un nouveau scan redonne l'accès", async () => {
    const newSets = await prisma.matchSet.findMany({ where: { matchId: boardOneMatchId }, include: { round: true } });
    const newSet1 = newSets.sort((a, b) => a.round.roundOrder - b.round.roundOrder)[0];

    // deviceA détient toujours SA session émise pour l'ancien match (fini) — elle ne doit
    // jamais s'appliquer au nouveau match promu sur la même cible. Toujours en visiteur anonyme
    // (depuis le test précédent) : authorizeScoring() ne peut donc être autorisé QUE par la
    // session terrain elle-même, jamais par un repli organisateur.
    setActiveDevice(deviceA);
    const refusedOldSession = await recordThrow(newSet1.id, tournamentId, 1, 60, randomUUID());
    expect(refusedOldSession.error).toBeDefined();

    // Nouveau scan (nouvel appareil, ou le même rescanné) → nouvelle session → autorisé.
    setActiveDevice(deviceNewScan);
    await issueFieldSession(tournamentId, boardOneMatchId, "PLAYER");
    const authorized = await recordThrow(newSet1.id, tournamentId, 1, 60, randomUUID());
    expect(authorized.error).toBeUndefined();
    asOrganizer();
  });

  // ── Parcours arbitre (cible 2, DO-FIELD-ACCESS-002) ─────────────────────────

  const deviceReferee = newDeviceJar();
  let refereeProof: string;

  it("20-21. l'organisateur génère un accès arbitre pour la cible 2, échangé contre une session REFEREE", async () => {
    asOrganizer();
    const access = await generateRefereeAccess(tournamentId, "2");
    expect(access.error).toBeUndefined();
    expect(access.url).toContain("/field/referee?proof=");
    refereeProof = new URL(access.url!).searchParams.get("proof")!;
    expect(refereeProof).toBeTruthy();

    const redemption = await redeemRefereeGrant(refereeProof, tournamentId);
    expect(redemption).toEqual({ ok: true, matchId: boardTwoMatchId });

    setActiveDevice(deviceReferee);
    await issueFieldSession(tournamentId, boardTwoMatchId, "REFEREE");
    asAnonymous();
    expect(await verifyFieldSession(tournamentId, boardTwoMatchId)).toEqual({ ok: true, role: "REFEREE" });
  });

  it("preuve arbitre à usage unique — un second échange du même grant échoue", async () => {
    const secondRedemption = await redeemRefereeGrant(refereeProof, tournamentId);
    expect(secondRedemption.ok).toBe(false);
  });

  it("22. action REFEREE légitime — désigne directement le vainqueur des deux manches de la cible 2 (raccourci réservé arbitre/organisateur)", async () => {
    const sets = (await prisma.matchSet.findMany({ where: { matchId: boardTwoMatchId }, include: { round: true } }))
      .sort((a, b) => a.round.roundOrder - b.round.roundOrder);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: boardTwoMatchId } });

    setActiveDevice(deviceReferee);
    for (const set of sets) {
      const result = await markWinnerDirect(set.id, match.player1Id, tournamentId);
      expect(result.error).toBeUndefined();
    }

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: boardTwoMatchId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.winnerId).toBe(match.player1Id);
  });

  it("confirme qu'aucune action organisateur n'est accessible depuis la session REFEREE", async () => {
    setActiveDevice(deviceReferee);
    // getUser() reste anonyme : seule la session terrain (REFEREE) est en jeu ici, jamais un
    // repli organisateur.
    await expect(arbitrateMatch(boardTwoMatchId, tournamentId, [])).rejects.toThrow("NEXT_REDIRECT");
    await expect(reassignFreeBoards(tournamentId)).rejects.toThrow("NEXT_REDIRECT");
    asOrganizer();
  });

  // ── Pilotage vs réalité DB, Mercure, Live/TV (mission §6/§7/§8) ─────────────

  it("Pilotage à mi-tournoi — rechargé, comparé directement à la réalité PostgreSQL", async () => {
    const tournament = await dbGetTournamentPublic(tournamentId) as never as {
      status: string; quick_mode: boolean; scoring_mode: string; nb_boards: number; nb_pools: number; max_players: number; players_per_team: number;
    };
    const { matches } = await loadTournamentConsoleData(tournamentId);
    const boards = buildBoardsView(tournament, matches);

    const realActiveByBoard = await prisma.match.findMany({ where: { tournamentId, status: "IN_PROGRESS" } });
    for (const real of realActiveByBoard) {
      const consoleBoard = boards.find((b) => b.board === real.boardNumber);
      expect(consoleBoard?.status).toBe("active");
      expect(consoleBoard?.match?.id).toBe(real.id);
    }
    const realFinishedCount = await prisma.match.count({ where: { tournamentId, status: "FINISHED" } });
    const summary = buildConsoleSummary(tournament, [], matches);
    expect(summary.matchesFinished).toBe(realFinishedCount); // aucune divergence Pilotage ↔ DB
  });

  it("Mercure — une publication réelle après un changement de score ne lève aucune exception", async () => {
    // DO-BETA-001 §7 — MERCURE_PRIVATE_URL/MERCURE_JWT_SECRET sont configurés en local (hub
    // Docker sain, confirmé au préflight) : cet appel exerce réellement la signature JWT et la
    // publication HTTP vers le hub, pas un simple mock. Limite honnête : aucune vérification
    // d'un VRAI abonné recevant le message (EventSource) n'est faite ici — cela exigerait un
    // client SSE réel, hors de portée proportionnée d'un test Vitest ; ConsoleAutoRefresh.test.tsx
    // et MatchBoard couvrent déjà, séparément, la réception côté client (mockée).
    await expect(publishMatchUpdate(tournamentId)).resolves.not.toThrow();
  });

  it("Live/TV — la même source de données que les pages publiques reste cohérente en cours de tournoi", async () => {
    const publicTournament = await dbGetTournamentPublic(tournamentId);
    const publicMatches = await dbListMatches(tournamentId);
    expect(publicTournament?.status).toBe("IN_PROGRESS");
    const activeOnLive = publicMatches.filter((m) => m.status === "IN_PROGRESS");
    const activeReal = await prisma.match.count({ where: { tournamentId, status: "IN_PROGRESS" } });
    expect(activeOnLive).toHaveLength(activeReal);
  });

  // ── Progression du bracket jusqu'à la finale, clôture automatique (mission §2 pts 23-27) ──

  it("23-24. les quarts de finale restants, demi-finales et finale se jouent (désignation organisateur, plusieurs matchs)", async () => {
    asOrganizer();
    let iterations = 0;
    while (iterations < 20) {
      const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (t.status === "FINISHED") break;

      const active = await prisma.match.findFirst({ where: { tournamentId, poolId: null, status: "IN_PROGRESS" } });
      if (!active) break; // rien à jouer pour l'instant (ne devrait pas arriver ici)

      const sets = (await prisma.matchSet.findMany({ where: { matchId: active.id }, include: { round: true } }))
        .sort((a, b) => a.round.roundOrder - b.round.roundOrder);
      for (const set of sets) {
        const result = await markWinnerDirect(set.id, active.player1Id, tournamentId);
        expect(result.error).toBeUndefined();
      }
      iterations++;
    }
    expect(iterations).toBeLessThan(20); // jamais une boucle infinie — le tournoi doit converger
  });

  it("25-26. tournoi terminé — statut FINISHED, un seul champion cohérent", async () => {
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(t.status).toBe("FINISHED");

    const finalMatch = await prisma.match.findFirstOrThrow({
      where: { tournamentId, poolId: null, bracketType: "SINGLE" },
      orderBy: { bracketRound: "desc" },
    });
    expect(finalMatch.status).toBe("FINISHED");
    expect(finalMatch.winnerId).not.toBeNull();
  });

  it("27. Pilotage APRÈS clôture — vue finale sans action de conduite", async () => {
    const tournament = await dbGetTournamentPublic(tournamentId) as never as {
      status: string; quick_mode: boolean; scoring_mode: string; nb_boards: number; nb_pools: number; max_players: number; players_per_team: number;
    };
    const { registrations, pools, matches } = await loadTournamentConsoleData(tournamentId);
    const checklist = buildReadinessChecklist(tournament, registrations, pools);
    const summary = buildConsoleSummary(tournament, registrations, matches);
    const nextAction = buildNextAction(tournamentId, tournament, checklist, summary, pools, detectIncidents(tournament, matches));

    expect(nextAction.tone).toBe("info"); // FINISHED → jamais une action de conduite proposée
    expect(summary.progressPercent).toBe(100);
  });

  it("28. classement final — le champion du tournoi apparaît avec son bonus (lib/db/ranking.ts, inter-tournois)", async () => {
    const finalMatch = await prisma.match.findFirstOrThrow({
      where: { tournamentId, poolId: null, bracketType: "SINGLE" },
      orderBy: { bracketRound: "desc" },
      include: { winner: { select: { playerName: true } } },
    });
    const { dbGetRanking } = await import("@/lib/db/ranking");
    const ranking = await dbGetRanking();
    // dbGetRanking() est inter-tournois (classement global) : on retrouve NOTRE champion par
    // son nom (préfixé "BêtaJoueur" pour ne jamais collisionner avec un autre fichier de test
    // exécuté en parallèle), sans supposer qu'il est premier de la liste globale.
    const championEntry = ranking.find((r) => r.player_name === finalMatch.winner!.playerName);
    expect(championEntry).toBeDefined();
    expect(championEntry!.championships).toBeGreaterThanOrEqual(1);
    expect(championEntry!.points).toBeGreaterThanOrEqual(10); // bonus champion, lib/db/ranking.ts
  });

  // ── Contrôles PostgreSQL finaux (mission §14) ───────────────────────────────

  it("contrôles PostgreSQL finaux — cohérence complète de bout en bout", async () => {
    // Un seul champion cohérent : un seul match SINGLE au round le plus élevé, un vainqueur.
    const finalMatches = await prisma.match.findMany({ where: { tournamentId, poolId: null, bracketType: "SINGLE" } });
    const maxRound = Math.max(...finalMatches.map((m) => m.bracketRound ?? 0));
    const trueFinal = finalMatches.filter((m) => m.bracketRound === maxRound);
    expect(trueFinal).toHaveLength(1);
    expect(trueFinal[0].winnerId).not.toBeNull();

    // Tous les matchs attendus (4 QF + 2 SF + 1 finale = 7) sont FINISHED.
    const allMatches = await prisma.match.findMany({ where: { tournamentId } });
    expect(allMatches).toHaveLength(7);
    expect(allMatches.every((m) => m.status === "FINISHED")).toBe(true);

    // Aucune cible avec plusieurs matchs actifs (trivial ici : plus aucun match actif du tout).
    const stillActive = allMatches.filter((m) => m.status === "IN_PROGRESS");
    expect(stillActive).toHaveLength(0);

    // Aucun match PENDING résiduel anormal.
    const stillPending = allMatches.filter((m) => m.status === "PENDING");
    expect(stillPending).toHaveLength(0);

    // Aucune ancienne session ne permet encore de scorer : TOUTES les sessions terrain émises
    // pendant le scénario visent des matchs désormais FINISHED — verifyFieldSession doit
    // refuser chacune d'entre elles.
    const allSessions = await prisma.fieldSession.findMany({ where: { tournamentId } });
    expect(allSessions.length).toBeGreaterThan(0); // le scénario en a bien émis plusieurs
    for (const session of allSessions) {
      const match = await prisma.match.findUniqueOrThrow({ where: { id: session.matchId } });
      expect(match.status).toBe("FINISHED"); // donc verifyFieldToken les refuserait toutes désormais
    }

    // Historique X01 cohérent : le match détaillé (cible 1, manche 1+2) a un historique de
    // volées non vide, sans doublon de checkout malgré la double-soumission concurrente testée.
    const set1Throws = await dbListMatchSetThrows(boardOneSet1Id);
    const set2Throws = await dbListMatchSetThrows(boardOneSet2Id);
    expect(set1Throws.length).toBeGreaterThan(0);
    expect(set2Throws.length).toBeGreaterThan(0);
    expect(set1Throws.filter((t) => !t.cancelled && t.remaining_after === 0)).toHaveLength(1);
    expect(set2Throws.filter((t) => !t.cancelled && t.remaining_after === 0)).toHaveLength(1);

    // Manches cohérentes avec leurs vainqueurs : chaque MatchSet d'un match FINISHED a un
    // winnerId, et ce vainqueur est bien l'un des deux joueurs du match.
    const allSets = await prisma.matchSet.findMany({ where: { match: { tournamentId } }, include: { match: true } });
    for (const set of allSets) {
      expect(set.winnerId).not.toBeNull();
      expect([set.match.player1Id, set.match.player2Id]).toContain(set.winnerId);
    }

    // Tournoi FINISHED (déjà vérifié, reconfirmé directement ici).
    const finalTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(finalTournament.status).toBe("FINISHED");

    // Console cohérente avec la DB, une dernière fois après clôture complète.
    const consoleTournament = await dbGetTournamentPublic(tournamentId) as never as {
      status: string; quick_mode: boolean; scoring_mode: string; nb_boards: number; nb_pools: number; max_players: number; players_per_team: number;
    };
    const { matches: consoleMatches } = await loadTournamentConsoleData(tournamentId);
    const consoleSummary = buildConsoleSummary(consoleTournament, [], consoleMatches);
    expect(consoleSummary.matchesFinished).toBe(7);
    expect(consoleSummary.progressPercent).toBe(100);
    expect(detectIncidents(consoleTournament, consoleMatches)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cas d'échec opérationnels (mission §12) — un second tournoi minimal, frais et actif, pour
// exercer les refus qui ont besoin d'un match encore EN COURS (le tournoi principal ci-dessus
// est désormais FINISHED). Le système doit produire un refus compréhensible et rester cohérent.
// ─────────────────────────────────────────────────────────────────────────────
describe("DO-BETA-001 — cas d'échec opérationnels", () => {
  let opsTournamentId: string;
  let otherTournamentId: string;
  let opsMatchId: string;
  let opsSetId: string;

  it("prépare un second tournoi minimal actif (2 joueurs, 1 cible)", async () => {
    asOrganizer();
    const t = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Bêta — cas d'échec", date: "2026-09-06", location: "Salle B",
        max_players: 2, entry_fee: 0, nb_pools: 1, nb_boards: 1, advancement_per_pool: 1,
        players_per_team: 1, registration_mode: "ONLINE", payment_mode: "ONSITE", scoring_mode: "TRADITIONAL",
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    opsTournamentId = t.id;
    await prisma.round.create({ data: { tournamentId: opsTournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" } });
    await prisma.registration.create({ data: { tournamentId: opsTournamentId, playerName: "BêtaÉchecP1", playerEmail: `echec1-${randomUUID()}@example.com`, playerNames: ["BêtaÉchecP1"], status: "PAID" } });
    await prisma.registration.create({ data: { tournamentId: opsTournamentId, playerName: "BêtaÉchecP2", playerEmail: `echec2-${randomUUID()}@example.com`, playerNames: ["BêtaÉchecP2"], status: "PAID" } });

    await updateTournamentStatus(opsTournamentId, "OPEN");
    await generateBracket(opsTournamentId);
    await updateTournamentStatus(opsTournamentId, "IN_PROGRESS");

    const matches = await dbListMatches(opsTournamentId);
    opsMatchId = matches[0].id;
    const sets = await prisma.matchSet.findMany({ where: { matchId: opsMatchId } });
    opsSetId = sets[0].id;

    // Second tournoi indépendant, pour le test "mauvaise session" ci-dessous.
    const other = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Bêta — autre tournoi", date: "2026-09-07", location: "Salle C",
        max_players: 2, entry_fee: 0, nb_pools: 1, nb_boards: 1, advancement_per_pool: 1,
        players_per_team: 1, registration_mode: "ONLINE", payment_mode: "ONSITE", scoring_mode: "TRADITIONAL",
      },
      randomUUID(),
    );
    createdTournamentIds.push(other.id);
    otherTournamentId = other.id;
  });

  it("mauvaise session — une session valide pour un AUTRE tournoi est refusée", async () => {
    const deviceWrong = newDeviceJar();
    setActiveDevice(deviceWrong);
    await issueFieldSession(otherTournamentId, opsMatchId, "PLAYER"); // matchId réel mais tournoi déclaré différent volontairement
    asAnonymous();
    const result = await recordThrow(opsSetId, opsTournamentId, 1, 60, randomUUID());
    expect(result.error).toBeDefined();
  });

  it("mauvaise alternance joueur — jouer hors de son tour est refusé", async () => {
    const deviceOps = newDeviceJar();
    setActiveDevice(deviceOps);
    await issueFieldSession(opsTournamentId, opsMatchId, "PLAYER");
    asAnonymous();

    const first = await recordThrow(opsSetId, opsTournamentId, 1, 100, randomUUID());
    expect(first.error).toBeUndefined(); // joueur 1 commence normalement

    const wrongTurn = await recordThrow(opsSetId, opsTournamentId, 1, 100, randomUUID()); // joueur 1 encore, alors que c'est au joueur 2
    expect(wrongTurn.error).toBeDefined();
    expect(wrongTurn.error).toMatch(/tour/i);
  });

  it("tentative de clôture prématurée — refusée tant qu'un match reste actif ou en attente", async () => {
    asOrganizer();
    const result = await updateTournamentStatus(opsTournamentId, "FINISHED");
    expect(result?.error).toBeDefined();
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: opsTournamentId } });
    expect(t.status).toBe("IN_PROGRESS"); // toujours en cours, aucune clôture silencieuse
  });

  it("action organisateur depuis un utilisateur non autorisé — refusée (ni le propriétaire, ni un visiteur terrain)", async () => {
    asStranger();
    await expect(reassignFreeBoards(opsTournamentId)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateRefereeAccess(opsTournamentId, "1")).rejects.toThrow("NEXT_NOT_FOUND");
    asOrganizer();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Smoke test mode rapide (mission §13) — confirme qu'aucune intégration récente (DO-FIELD-
// ACCESS/DO-OPS/le correctif de progression ci-dessus/DO-QUICK-POOL-001) n'a cassé ce mode, sans
// rejouer tout le scénario standard : création, démarrage, progression, perte de vie, appariement
// en bassin unique sur plusieurs vagues, fin.
// ─────────────────────────────────────────────────────────────────────────────
describe("DO-BETA-001 — smoke test mode rapide", () => {
  it("création → démarrage → génération → progression complète sur plusieurs vagues → fin", async () => {
    asOrganizer();
    const t = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Bêta — rapide", date: "2026-09-08", location: "Bar Le Domino",
        max_players: 4, entry_fee: 0, nb_pools: 1, nb_boards: 2, advancement_per_pool: 1,
        players_per_team: 1, registration_mode: "ONSITE", payment_mode: "ONSITE", scoring_mode: "ELECTRONIC",
        quick_mode: true,
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    expect(t.quick_mode).toBe(true);

    const quickPlayers: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const p = await prisma.registration.create({
        data: { tournamentId: t.id, playerName: `BêtaRapide${i}`, playerEmail: `rapide${i}-${randomUUID()}@example.com`, playerNames: [`BêtaRapide${i}`], status: "PAID" },
      });
      quickPlayers.push(p.id);
    }

    await updateTournamentStatus(t.id, "OPEN");
    await updateTournamentStatus(t.id, "IN_PROGRESS");

    const genResult = await generateQuickBracket(t.id);
    expect(genResult.error).toBeUndefined();

    const initialMatches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(initialMatches.some((m) => m.bracketType === "SINGLE" && m.bracketRound === 1)).toBe(true);

    // Résout tout match actif jusqu'à la clôture — organisateur, via arbitrateMatch (le seul
    // point d'entrée prévu pour désigner un vainqueur en mode rapide, CLAUDE.md).
    let iterations = 0;
    while (iterations < 20) {
      const current = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
      if (current.status === "FINISHED") break;

      const active = await prisma.match.findFirst({ where: { tournamentId: t.id, poolId: null, status: { not: "FINISHED" }, boardNumber: { gt: 0 } } });
      if (!active) break;

      const sets = await prisma.matchSet.findMany({ where: { matchId: active.id } });
      const setWinners = sets.map((s) => ({ setId: s.id, winnerId: active.player1Id }));
      const result = await arbitrateMatch(active.id, t.id, setWinners);
      expect(result.error).toBeUndefined();
      iterations++;
    }
    expect(iterations).toBeLessThan(20); // converge, jamais une boucle infinie

    const finalTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(finalTournament.status).toBe("FINISHED");

    // Perte de vie : au moins un joueur a perdu une vie (2 → 1 ou 0) en cours de route.
    const finalRegistrations = await prisma.registration.findMany({ where: { id: { in: quickPlayers } } });
    expect(finalRegistrations.some((r) => r.lives < 2)).toBe(true);

    // Plusieurs vagues d'appariement créées par le moteur au fil de la progression (bassin
    // unique, DO-QUICK-POOL-001 — un seul compteur de round, plus de WB/LB/Grande Finale).
    const allQuickMatches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(allQuickMatches.every((m) => m.bracketType === "SINGLE")).toBe(true);
    const maxRound = Math.max(...allQuickMatches.map((m) => m.bracketRound ?? 0));
    expect(maxRound).toBeGreaterThan(1);
  });
});
