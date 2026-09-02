import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";

/**
 * DO-FIELD-INCIDENT-002 — fermeture du forfait en mode rapide, décision Product Owner : « un
 * forfait équivaut à une défaite normale sur ce match » (perte d'exactement une vie, victoire
 * adverse, progression normale via le moteur rapide existant — jamais un abandon complet du
 * tournoi, jamais une seconde règle de perte de vie).
 *
 * Le produit plafonne les vies à 2 (`dbResetAllLives`, CLAUDE.md « Chaque joueur a 2 vies ») —
 * les seuls états de vie réellement atteignables pour un joueur encore en lice sont donc 2 et 1.
 * Le Cas A de la mission (« joueur avec plusieurs vies… 3 → 2 ») est ici couvert par DEUX
 * vérifications complémentaires plutôt qu'un seul état artificiel :
 *  - une vérification isolée du décompte générique (bump manuel à 3 vies, jamais atteignable via
 *    le moteur réel, pour prouver que dbDeclareForfeit/dbDecrementLives ne suppose jamais un
 *    plafond à 2 en dur) ;
 *  - le parcours réaliste 2 → 1 (survit, rejoint la losers bracket), qui est la seule transition
 *    "plusieurs vies restantes" réellement produite par ce moteur — et qui sert aussi de
 *    vérification du Cas G (réapparition normale dans la suite du tournoi).
 * Voir le rapport de mission pour cette précision.
 */

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ getUser: vi.fn() }));

function newDeviceJar(): Map<string, string> {
  return new Map<string, string>();
}

let activeJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (activeJar.has(name) ? { name, value: activeJar.get(name)! } : undefined),
    set: (name: string, value: string) => { activeJar.set(name, value); },
    delete: (name: string) => { activeJar.delete(name); },
  }),
}));

const { prisma } = await import("@/lib/db/client");
const { dbCreateTournament } = await import("@/lib/db/tournament");
const { dbListFieldIncidents } = await import("@/lib/db/fieldIncident");
const { getUser } = await import("@/lib/api/auth");
const { updateTournamentStatus } = await import("@/lib/actions/tournament");
const { generateQuickBracket } = await import("@/lib/actions/quickTournament");
const { markWinnerDirect } = await import("@/lib/actions/score");
const { issueFieldSession, redeemRefereeGrant } = await import("@/lib/actions/fieldAccess");
const { generateRefereeAccess } = await import("@/lib/actions/fieldReferee");
const { reportFieldIncident, declareForfeit } = await import("@/lib/actions/fieldIncident");

const OWNER_ID = "user-field-incident-002";
const OWNER = { id: OWNER_ID, email: "organisateur@example.com", roles: [], isVerified: true };

function asOrganizer() {
  vi.mocked(getUser).mockResolvedValue(OWNER as never);
}
function asAnonymous() {
  vi.mocked(getUser).mockResolvedValue(null);
}
function setActiveDevice(jar: Map<string, string>) {
  activeJar = jar;
}

const createdTournamentIds: string[] = [];

beforeAll(() => {
  asOrganizer();
});

afterAll(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.fieldIncident.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
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

async function playerLives(id: string): Promise<number> {
  const r = await prisma.registration.findUniqueOrThrow({ where: { id } });
  return r.lives;
}

let tournamentId: string;
let matchAId: string; // cible 1 — Cas A/E/G/incident
let matchBId: string; // cible 2 — Cas D (concurrence)
let matchCId: string; // en attente au départ — Cas F (terminé normalement)
let matchAP1: string;
let matchAP2: string;
let matchBP1: string;
let matchBP2: string;
let matchCP1: string;
let matchCP2: string;

describe("DO-FIELD-INCIDENT-002 — forfait en mode rapide (perte d'une vie = défaite normale)", () => {
  it("prépare un tournoi rapide actif (8 joueurs, 2 cibles) — 2 matchs WB en cours, 2 en attente", async () => {
    asOrganizer();
    const t = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Forfait Rapide", date: "2026-09-15", location: "Bar Le Domino",
        max_players: 8, entry_fee: 0, nb_pools: 1, nb_boards: 2, advancement_per_pool: 1,
        players_per_team: 1, registration_mode: "ONSITE", payment_mode: "ONSITE", scoring_mode: "ELECTRONIC",
        quick_mode: true,
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    tournamentId = t.id;

    for (let i = 1; i <= 8; i++) {
      await prisma.registration.create({
        data: { tournamentId, playerName: `ForfaitRapide${i}`, playerEmail: `fr${i}-${randomUUID()}@example.com`, playerNames: [`ForfaitRapide${i}`], status: "PAID" },
      });
    }

    await updateTournamentStatus(tournamentId, "OPEN");
    await updateTournamentStatus(tournamentId, "IN_PROGRESS");

    const genResult = await generateQuickBracket(tournamentId);
    expect(genResult.error).toBeUndefined();

    const active = await prisma.match.findMany({ where: { tournamentId, status: "IN_PROGRESS" } });
    const pending = await prisma.match.findMany({ where: { tournamentId, status: "PENDING" } });
    expect(active).toHaveLength(2);
    expect(pending).toHaveLength(2);

    const matchA = active.find((m) => m.boardNumber === 1)!;
    const matchB = active.find((m) => m.boardNumber === 2)!;
    const matchC = pending[0];
    matchAId = matchA.id; matchAP1 = matchA.player1Id!; matchAP2 = matchA.player2Id!;
    matchBId = matchB.id; matchBP1 = matchB.player1Id!; matchBP2 = matchB.player2Id!;
    matchCId = matchC.id; matchCP1 = matchC.player1Id!; matchCP2 = matchC.player2Id!;

    // Tous les joueurs actifs démarrent à 2 vies (dbResetAllLives, appelé par generateQuickBracket).
    expect(await playerLives(matchAP1)).toBe(2);
    expect(await playerLives(matchAP2)).toBe(2);
  });

  it("Cas E — le forfait ne peut désigner qu'un participant réel du match (aucune écriture)", async () => {
    asOrganizer();
    const result = await declareForfeit(tournamentId, matchAId, randomUUID());
    expect(result.error).toBeDefined();

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });
    expect(match.status).toBe("IN_PROGRESS");
    expect(match.forfeitedPlayerId).toBeNull();
    expect(await playerLives(matchAP1)).toBe(2);
    expect(await playerLives(matchAP2)).toBe(2);
  });

  it("incident PLAYER_ABSENT signalé sur la cible 1 avant le forfait (support de la vérification 'Incident')", async () => {
    asAnonymous();
    const devicePlayer = newDeviceJar();
    setActiveDevice(devicePlayer);
    await issueFieldSession(tournamentId, matchAId, "PLAYER");
    const result = await reportFieldIncident(tournamentId, matchAId, "PLAYER_ABSENT");
    expect(result.error).toBeUndefined();
  });

  const deviceReferee = newDeviceJar();

  it("l'organisateur assigne un arbitre à la cible 1", async () => {
    asOrganizer();
    const access = await generateRefereeAccess(tournamentId, "1");
    const proof = new URL(access.url!).searchParams.get("proof")!;
    asAnonymous();
    const redemption = await redeemRefereeGrant(proof, tournamentId);
    expect(redemption).toEqual({ ok: true, matchId: matchAId });

    setActiveDevice(deviceReferee);
    await issueFieldSession(tournamentId, matchAId, "REFEREE");
  });

  it("Cas A — 2 vies → 1 vie : victoire adverse, perte d'exactement une vie, incident auto-résolu, progression normale", async () => {
    asAnonymous();
    setActiveDevice(deviceReferee);
    const result = await declareForfeit(tournamentId, matchAId, matchAP2);
    expect(result.error).toBeUndefined();

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.winnerId).toBe(matchAP1); // adversaire gagne
    expect(finished.forfeitedPlayerId).toBe(matchAP2); // historique : jamais confondu avec une victoire normale
    expect(finished.quickAdvanceProcessedAt).not.toBeNull(); // progression rapide bien déclenchée

    // Perte d'exactement UNE vie — le seul mécanisme qui l'applique est doAdvanceQuickTournamentTx.
    expect(await playerLives(matchAP2)).toBe(1);
    expect(await playerLives(matchAP1)).toBe(2); // le vainqueur ne perd rien

    // Cible libérée puis un match en attente promu dessus (même mécanique que le mode standard).
    const boardOneNow = await prisma.match.findFirst({ where: { tournamentId, boardNumber: 1, status: "IN_PROGRESS" } });
    expect(boardOneNow).not.toBeNull();
    expect(boardOneNow!.id).not.toBe(matchAId);

    // Incident sportif auto-résolu maintenant que le match a un vainqueur réel (comportement
    // DO-FIELD-INCIDENT-001 conservé tel quel).
    const incidents = await dbListFieldIncidents(tournamentId);
    expect(incidents.find((fi) => fi.match_id === matchAId && fi.type === "PLAYER_ABSENT")!.status).toBe("RESOLVED");

    // DO-QUICK-POOL-001 — bassin unique : matchAP1 (le vainqueur, 2 vies) ET matchAP2 (1 vie)
    // deviennent TOUS DEUX disponibles au même instant dès que matchA se termine — le moteur les
    // réapparie immédiatement l'un contre l'autre, peu importe leurs vies respectives, sans
    // attendre qu'un second perdant existe (contrairement à l'ancien découpage WB/LB, qui
    // n'appariait une nouvelle manche losers qu'à partir de deux joueurs à 1 vie disponibles).
    const rematch = await prisma.match.findFirst({
      where: { tournamentId, status: { not: "FINISHED" }, OR: [{ player1Id: matchAP2 }, { player2Id: matchAP2 }] },
    });
    expect(rematch).not.toBeNull();
    expect([rematch!.player1Id, rematch!.player2Id]).toContain(matchAP1);
    expect(rematch!.bracketType).toBe("SINGLE");
  });

  it("Cas C — rejouer le MÊME forfait est idempotent : aucune vie supplémentaire perdue, aucune nouvelle progression", async () => {
    const totalMatchesBefore = await prisma.match.count({ where: { tournamentId } });

    asOrganizer(); // rejeu réaliste par l'organisateur (session REFEREE de matchA désormais invalide, match FINISHED)
    const replay = await declareForfeit(tournamentId, matchAId, matchAP2);
    expect(replay.error).toBeUndefined();

    expect(await playerLives(matchAP2)).toBe(1); // toujours 1, jamais décrémenté une seconde fois
    const totalMatchesAfter = await prisma.match.count({ where: { tournamentId } });
    expect(totalMatchesAfter).toBe(totalMatchesBefore); // aucun nouveau match créé par ce rejeu
  });

  it("vies génériques (illustration Cas A, '3 vies → 2') — le décompte ne suppose jamais un plafond à 2 en dur", async () => {
    // Situation jamais produite par le moteur réel (plafond produit à 2 vies, CLAUDE.md) : bump
    // manuel pour isoler UNIQUEMENT le comportement générique de dbDeclareForfeit/
    // dbDecrementLives, sans prétendre représenter un état de vies réellement atteignable.
    await prisma.registration.update({ where: { id: matchCP1 }, data: { lives: 3 } });
    asOrganizer();

    const result = await declareForfeit(tournamentId, matchCId, matchCP1);
    expect(result.error).toBeUndefined();
    expect(await playerLives(matchCP1)).toBe(2); // 3 → 2, jamais 0 ni une décrémentation multiple

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: matchCId } });
    expect(finished.forfeitedPlayerId).toBe(matchCP1);
    expect(finished.winnerId).toBe(matchCP2);
  });

  it("Cas D — deux déclarations réellement concurrentes du même forfait ne retirent qu'une seule vie", async () => {
    const [c1, c2] = await Promise.all([
      declareForfeit(tournamentId, matchBId, matchBP2),
      declareForfeit(tournamentId, matchBId, matchBP2),
    ]);
    expect(c1.error).toBeUndefined();
    expect(c2.error).toBeUndefined();

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: matchBId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.winnerId).toBe(matchBP1);
    expect(finished.forfeitedPlayerId).toBe(matchBP2);

    expect(await playerLives(matchBP2)).toBe(1); // une seule perte de vie malgré les deux appels

    // Une seule promotion réelle sur la cible libérée.
    const boardTwoActive = await prisma.match.findMany({ where: { tournamentId, boardNumber: 2, status: "IN_PROGRESS" } });
    expect(boardTwoActive).toHaveLength(1);
  });

  it("Cas G — les joueurs qui viennent de perdre une vie sont réappariés chacun immédiatement, sans attendre un second perdant (DO-QUICK-POOL-001)", async () => {
    // Sous l'ancien découpage WB/LB, matchAP2 (Cas A) et matchBP2 (Cas D) auraient dû tous deux
    // attendre qu'un DEUXIÈME joueur à 1 vie soit disponible avant d'être réappariés. Le bassin
    // unique n'a plus ce seuil : chacun a déjà été réapparié contre son propre vainqueur dès que
    // celui-ci est redevenu disponible (voir Cas A ci-dessus) — jamais forcés l'un contre l'autre
    // seulement parce qu'ils partagent le même nombre de vies.
    const matchAP2Match = await prisma.match.findFirst({
      where: { tournamentId, status: { not: "FINISHED" }, OR: [{ player1Id: matchAP2 }, { player2Id: matchAP2 }] },
    });
    const matchBP2Match = await prisma.match.findFirst({
      where: { tournamentId, status: { not: "FINISHED" }, OR: [{ player1Id: matchBP2 }, { player2Id: matchBP2 }] },
    });
    expect(matchAP2Match).not.toBeNull();
    expect(matchBP2Match).not.toBeNull();
    expect([matchAP2Match!.player1Id, matchAP2Match!.player2Id]).toContain(matchAP1);
    expect([matchBP2Match!.player1Id, matchBP2Match!.player2Id]).toContain(matchBP1);
    expect(matchAP2Match!.bracketType).toBe("SINGLE");
  });

  it("Cas B — dernière vie : 1 → 0, élimination selon le moteur existant, progression normale", async () => {
    // matchAP2 est à 1 vie et déjà réapparié contre matchAP1 depuis Cas A (confirmé par Cas G) ;
    // retrouve son match actuel pour lui déclarer un second forfait — un événement DIFFÉRENT, sur
    // un match DIFFÉRENT, légitimement testable indépendamment du premier.
    const currentMatch = await prisma.match.findFirstOrThrow({
      where: { tournamentId, status: { not: "FINISHED" }, OR: [{ player1Id: matchAP2 }, { player2Id: matchAP2 }] },
    });
    const opponentId = currentMatch.player1Id === matchAP2 ? currentMatch.player2Id! : currentMatch.player1Id!;

    asOrganizer();
    const result = await declareForfeit(tournamentId, currentMatch.id, matchAP2);
    expect(result.error).toBeUndefined();

    expect(await playerLives(matchAP2)).toBe(0); // dernière vie perdue → éliminé

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: currentMatch.id } });
    expect(finished.winnerId).toBe(opponentId);
    expect(finished.forfeitedPlayerId).toBe(matchAP2);

    // Élimination confirmée par le moteur existant : plus aucun match non terminé ne référence
    // ce joueur (dbGetQuickTournamentState/doAdvanceQuickTournamentTx l'exclut désormais des
    // joueurs actifs — jamais réintégré dans une paire).
    const stillInPlay = await prisma.match.findFirst({
      where: { tournamentId, status: { not: "FINISHED" }, OR: [{ player1Id: matchAP2 }, { player2Id: matchAP2 }] },
    });
    expect(stillInPlay).toBeNull();
  });

  it("Cas F — un match déjà terminé NORMALEMENT (sans forfait) refuse tout forfait ultérieur, sans nouvelle perte de vie", async () => {
    asOrganizer();

    // Termine un match distinct NORMALEMENT (arbitrage direct, pas un forfait), pour tester le
    // refus du forfait sur un match déjà décidé par un AUTRE mécanisme.
    const normalMatch = await prisma.match.findFirstOrThrow({ where: { tournamentId, status: "IN_PROGRESS" } });
    const loserId = normalMatch.player2Id!;
    const normalSets = await prisma.matchSet.findMany({ where: { matchId: normalMatch.id } });
    for (const set of normalSets) {
      const r = await markWinnerDirect(set.id, normalMatch.player1Id!, tournamentId);
      expect(r.error).toBeUndefined();
    }
    const livesBefore = await playerLives(loserId);

    const forfeitAttempt = await declareForfeit(tournamentId, normalMatch.id, loserId);
    expect(forfeitAttempt.error).toBeDefined();

    expect(await playerLives(loserId)).toBe(livesBefore); // aucune nouvelle perte de vie
    const stillFinished = await prisma.match.findUniqueOrThrow({ where: { id: normalMatch.id } });
    expect(stillFinished.forfeitedPlayerId).toBeNull(); // jamais réécrit par le refus
  });

  it("autorisations — PLAYER ne peut jamais déclarer forfait en mode rapide, anonyme refusé", async () => {
    const anyActive = await prisma.match.findFirstOrThrow({ where: { tournamentId, status: "IN_PROGRESS" } });

    asAnonymous();
    const noSession = await declareForfeit(tournamentId, anyActive.id, anyActive.player1Id!);
    expect(noSession.error).toBeDefined();

    const devicePlayer = newDeviceJar();
    setActiveDevice(devicePlayer);
    await issueFieldSession(tournamentId, anyActive.id, "PLAYER");
    const asPlayer = await declareForfeit(tournamentId, anyActive.id, anyActive.player1Id!);
    expect(asPlayer.error).toBeDefined();

    const match = await prisma.match.findUniqueOrThrow({ where: { id: anyActive.id } });
    expect(match.forfeitedPlayerId).toBeNull();
  });
});
