import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";

/**
 * DO-FIELD-INCIDENT-001 — signalement/traitement des incidents terrain (joueur absent, résultat
 * contesté, autre) contre un vrai PostgreSQL. Reproduit le parcours complet des trois profils
 * (PLAYER/REFEREE/ORGANIZER) exactement via les Server Actions réelles (reportFieldIncident/
 * declareForfeit/resolveOtherIncident, lib/actions/fieldIncident.ts) — jamais une fabrication
 * SQL brute de l'état testé. Même modèle de "coffres à cookies = appareils distincts" que
 * doBeta001.concurrency.test.ts / fieldAccess.concurrency.test.ts.
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
const { dbCreateTournament, dbListMatches } = await import("@/lib/db/tournament");
const { dbListFieldIncidents } = await import("@/lib/db/fieldIncident");
const { getUser } = await import("@/lib/api/auth");
const { updateTournamentStatus } = await import("@/lib/actions/tournament");
const { generateBracket } = await import("@/lib/actions/bracket");
const { recordThrow, markWinnerDirect } = await import("@/lib/actions/score");
const { arbitrateMatch } = await import("@/lib/actions/admin");
const { issueFieldSession } = await import("@/lib/actions/fieldAccess");
const { generateRefereeAccess } = await import("@/lib/actions/fieldReferee");
const { reportFieldIncident, declareForfeit, resolveOtherIncident } = await import("@/lib/actions/fieldIncident");
const { loadTournamentConsoleData } = await import("@/lib/ops/loadConsoleData");

const OWNER_ID = "user-field-incident-001";
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

let tournamentId: string;
let matchAId: string; // cible 1
let matchBId: string; // cible 2
let matchAPlayer1: string;
let matchAPlayer2: string;
let matchBPlayer1: string;
let matchBPlayer2: string;

describe("DO-FIELD-INCIDENT-001 — gestion opérationnelle des incidents terrain", () => {
  it("prépare un tournoi standard actif (8 joueurs, 2 cibles) — 2 quarts en cours, 2 en attente", async () => {
    asOrganizer();
    const t = await dbCreateTournament(
      OWNER_ID,
      {
        name: "Open Incidents Terrain", date: "2026-09-10", location: "Salle des Incidents",
        max_players: 8, entry_fee: 0, nb_pools: 1, nb_boards: 2, advancement_per_pool: 1,
        players_per_team: 1, registration_mode: "ONLINE", payment_mode: "ONSITE", scoring_mode: "TRADITIONAL",
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    tournamentId = t.id;

    await prisma.round.create({ data: { tournamentId, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" } });

    for (let i = 1; i <= 8; i++) {
      await prisma.registration.create({
        data: { tournamentId, playerName: `Incident${i}`, playerEmail: `incident${i}-${randomUUID()}@example.com`, playerNames: [`Incident${i}`], status: "PAID" },
      });
    }

    await updateTournamentStatus(tournamentId, "OPEN");
    await generateBracket(tournamentId);
    await updateTournamentStatus(tournamentId, "IN_PROGRESS");

    const matches = await dbListMatches(tournamentId);
    const active = matches.filter((m) => m.bracket_round === 1 && m.status === "IN_PROGRESS");
    expect(active).toHaveLength(2);

    const matchA = active.find((m) => m.board_number === 1)!;
    const matchB = active.find((m) => m.board_number === 2)!;
    matchAId = matchA.id;
    matchBId = matchB.id;
    matchAPlayer1 = matchA.player1!.id;
    matchAPlayer2 = matchA.player2!.id;
    matchBPlayer1 = matchB.player1!.id;
    matchBPlayer2 = matchB.player2!.id;
  });

  // ── Cible 1 : parcours PLAYER → REFEREE ─────────────────────────────────

  const devicePlayerA = newDeviceJar();

  it("1. PLAYER signale un joueur absent sur son match", async () => {
    asAnonymous();
    setActiveDevice(devicePlayerA);
    await issueFieldSession(tournamentId, matchAId, "PLAYER");

    const result = await reportFieldIncident(tournamentId, matchAId, "PLAYER_ABSENT");
    expect(result.error).toBeUndefined();
    expect(result.incidentId).toBeTruthy();
  });

  it("2. PLAYER signale (en plus) un résultat contesté sur le même match", async () => {
    setActiveDevice(devicePlayerA);
    const result = await reportFieldIncident(tournamentId, matchAId, "RESULT_DISPUTED", "Le score affiché ne correspond pas.");
    expect(result.error).toBeUndefined();
    expect(result.incidentId).toBeTruthy();
  });

  it("3. double-clic/retry — un second signalement PLAYER_ABSENT identique ne crée pas un doublon OPEN", async () => {
    setActiveDevice(devicePlayerA);
    const first = await reportFieldIncident(tournamentId, matchAId, "PLAYER_ABSENT");
    const retry = await reportFieldIncident(tournamentId, matchAId, "PLAYER_ABSENT");
    expect(retry.error).toBeUndefined();
    expect(retry.incidentId).toBe(first.incidentId);

    const count = await prisma.fieldIncident.count({ where: { matchId: matchAId, type: "PLAYER_ABSENT", status: "OPEN" } });
    expect(count).toBe(1);
  });

  let otherIncidentAId: string;

  it("crée un incident OTHER sur la cible 1 (support des tests 4/20)", async () => {
    setActiveDevice(devicePlayerA);
    const result = await reportFieldIncident(tournamentId, matchAId, "OTHER", "Fléchette cassée.");
    expect(result.error).toBeUndefined();
    otherIncidentAId = result.incidentId!;
  });

  it("4. PLAYER ne peut jamais résoudre un incident", async () => {
    setActiveDevice(devicePlayerA);
    const result = await resolveOtherIncident(tournamentId, matchAId, otherIncidentAId);
    expect(result.error).toBeDefined();

    const incident = await prisma.fieldIncident.findUniqueOrThrow({ where: { id: otherIncidentAId } });
    expect(incident.status).toBe("OPEN"); // aucune résolution n'a pu passer
  });

  it("5. PLAYER ne peut jamais déclarer un forfait", async () => {
    setActiveDevice(devicePlayerA);
    const result = await declareForfeit(tournamentId, matchAId, matchAPlayer2);
    expect(result.error).toBeDefined();

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });
    expect(match.status).toBe("IN_PROGRESS"); // aucune conséquence sportive
    expect(match.forfeitedPlayerId).toBeNull();
  });

  // ── Cible 2 : incident support pour le test de portée REFEREE (7/8) ────

  const devicePlayerB = newDeviceJar();
  let otherIncidentBId: string;

  it("crée un incident OTHER sur la cible 2 (support du test 7)", async () => {
    asAnonymous();
    setActiveDevice(devicePlayerB);
    await issueFieldSession(tournamentId, matchBId, "PLAYER");
    const result = await reportFieldIncident(tournamentId, matchBId, "OTHER");
    expect(result.error).toBeUndefined();
    otherIncidentBId = result.incidentId!;
  });

  // ── Arbitre affecté à la cible 1 ─────────────────────────────────────────

  const deviceReferee = newDeviceJar();

  it("l'organisateur assigne un arbitre à la cible 1 (session REFEREE liée à matchA)", async () => {
    asOrganizer();
    const access = await generateRefereeAccess(tournamentId, "1");
    expect(access.error).toBeUndefined();
    const proof = new URL(access.url!).searchParams.get("proof")!;

    const { redeemRefereeGrant } = await import("@/lib/actions/fieldAccess");
    asAnonymous();
    const redemption = await redeemRefereeGrant(proof, tournamentId);
    expect(redemption).toEqual({ ok: true, matchId: matchAId });

    setActiveDevice(deviceReferee);
    await issueFieldSession(tournamentId, matchAId, "REFEREE");
  });

  it("7. REFEREE (cible 1) ne peut pas intervenir sur l'incident d'un AUTRE match (cible 2)", async () => {
    setActiveDevice(deviceReferee);
    const resolveAttempt = await resolveOtherIncident(tournamentId, matchBId, otherIncidentBId);
    expect(resolveAttempt.error).toBeDefined();

    const forfeitAttempt = await declareForfeit(tournamentId, matchBId, matchBPlayer2);
    expect(forfeitAttempt.error).toBeDefined();

    const incident = await prisma.fieldIncident.findUniqueOrThrow({ where: { id: otherIncidentBId } });
    expect(incident.status).toBe("OPEN");
  });

  it("8. la session REFEREE ne devient jamais une session organisatrice", async () => {
    setActiveDevice(deviceReferee);
    await expect(arbitrateMatch(matchAId, tournamentId, [])).rejects.toThrow("NEXT_REDIRECT");
  });

  it("13. le forfait ne peut désigner qu'un participant réel du match", async () => {
    setActiveDevice(deviceReferee);
    const result = await declareForfeit(tournamentId, matchAId, randomUUID());
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/participe pas/);
  });

  it("6/14/15/17. REFEREE déclare le forfait sur SON match — victoire adverse, progression, auto-résolution des incidents sportifs", async () => {
    setActiveDevice(deviceReferee);
    const result = await declareForfeit(tournamentId, matchAId, matchAPlayer2);
    expect(result.error).toBeUndefined();

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.winnerId).toBe(matchAPlayer1); // 14. victoire correcte de l'adversaire
    expect(finished.forfeitedPlayerId).toBe(matchAPlayer2);

    // 15. progression standard : la cible 1 est libérée puis un match en attente y est promu.
    const boardOneNow = await prisma.match.findFirst({ where: { tournamentId, boardNumber: 1, status: "IN_PROGRESS" } });
    expect(boardOneNow).not.toBeNull();
    expect(boardOneNow!.id).not.toBe(matchAId);

    // 17. les incidents sportifs (PLAYER_ABSENT/RESULT_DISPUTED) s'auto-résolvent maintenant que
    // le match a un vainqueur réel — jamais l'incident OTHER, non sportif, qui reste OPEN (20).
    const incidents = await dbListFieldIncidents(tournamentId);
    const forMatchA = incidents.filter((fi) => fi.match_id === matchAId);
    expect(forMatchA.find((fi) => fi.type === "PLAYER_ABSENT")!.status).toBe("RESOLVED");
    expect(forMatchA.find((fi) => fi.type === "RESULT_DISPUTED")!.status).toBe("RESOLVED");
    expect(forMatchA.find((fi) => fi.type === "OTHER")!.status).toBe("OPEN");
  });

  it("16. rejouer le MÊME forfait est idempotent — aucune double progression", async () => {
    // La session REFEREE de matchA est désormais invalide (le match a quitté IN_PROGRESS — voir
    // le test 11 juste après) : le rejeu réaliste passe par l'organisateur, dont l'autorisation
    // ne dépend pas du statut du match — exactement le chemin qui exerce réellement la branche
    // idempotente de dbDeclareForfeit (match déjà FINISHED, même forfeitedPlayerId).
    const boardOneBefore = await prisma.match.findFirst({ where: { tournamentId, boardNumber: 1, status: "IN_PROGRESS" } });

    asOrganizer();
    const replay = await declareForfeit(tournamentId, matchAId, matchAPlayer2);
    expect(replay.error).toBeUndefined();

    const boardOneAfter = await prisma.match.findFirst({ where: { tournamentId, boardNumber: 1, status: "IN_PROGRESS" } });
    expect(boardOneAfter?.id).toBe(boardOneBefore?.id); // pas de seconde promotion
  });

  it("11. une ancienne session terrain (match désormais terminé) est refusée", async () => {
    asAnonymous(); // force l'exercice réel du chemin session terrain, jamais un repli organisateur
    setActiveDevice(deviceReferee); // session émise pour matchA, désormais FINISHED
    const result = await reportFieldIncident(tournamentId, matchAId, "OTHER");
    expect(result.error).toBeDefined();
  });

  it("9/20. ORGANIZER résout l'incident OTHER sans mutation sportive", async () => {
    asOrganizer();
    const before = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });

    const result = await resolveOtherIncident(tournamentId, matchAId, otherIncidentAId);
    expect(result.error).toBeUndefined();

    const incident = await prisma.fieldIncident.findUniqueOrThrow({ where: { id: otherIncidentAId } });
    expect(incident.status).toBe("RESOLVED");

    const after = await prisma.match.findUniqueOrThrow({ where: { id: matchAId } });
    expect(after.winnerId).toBe(before.winnerId); // aucune conséquence sportive
    expect(after.status).toBe(before.status);
  });

  it("10. anonyme sans session — toutes les actions sont refusées", async () => {
    asAnonymous();
    setActiveDevice(newDeviceJar()); // aucun cookie
    expect((await reportFieldIncident(tournamentId, matchBId, "OTHER")).error).toBeDefined();
    expect((await declareForfeit(tournamentId, matchBId, matchBPlayer2)).error).toBeDefined();
    expect((await resolveOtherIncident(tournamentId, matchBId, otherIncidentBId)).error).toBeDefined();
  });

  // ── Cible 2 : Pilotage, concurrence, résolution d'échec ─────────────────

  it("19. un résultat contesté encore OPEN est bien visible dans les incidents Pilotage", async () => {
    asAnonymous();
    setActiveDevice(devicePlayerB);
    const disputed = await reportFieldIncident(tournamentId, matchBId, "RESULT_DISPUTED", "Désaccord sur la dernière volée.");
    expect(disputed.error).toBeUndefined();

    const { fieldIncidents } = await loadTournamentConsoleData(tournamentId);
    const found = fieldIncidents.find((fi) => fi.id === disputed.incidentId);
    expect(found).toBeDefined();
    expect(found!.status).toBe("OPEN");
    expect(found!.type).toBe("RESULT_DISPUTED");
    // Distinguable d'un match jamais démarré : le match référencé est bien IN_PROGRESS, avec un id explicite.
    expect(found!.match_id).toBe(matchBId);
  });

  it("21. concurrence — deux signalements PLAYER_ABSENT simultanés sur la cible 2 ne créent qu'UN incident", async () => {
    setActiveDevice(devicePlayerB);
    const [r1, r2] = await Promise.all([
      reportFieldIncident(tournamentId, matchBId, "PLAYER_ABSENT"),
      reportFieldIncident(tournamentId, matchBId, "PLAYER_ABSENT"),
    ]);
    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeUndefined();

    const count = await prisma.fieldIncident.count({ where: { matchId: matchBId, type: "PLAYER_ABSENT", status: "OPEN" } });
    expect(count).toBe(1);
  });

  it("18. un échec de forfait (joueur hors match) laisse l'incident OPEN", async () => {
    asOrganizer();
    const before = await prisma.fieldIncident.findFirst({ where: { matchId: matchBId, type: "PLAYER_ABSENT", status: "OPEN" } });
    expect(before).not.toBeNull();

    const result = await declareForfeit(tournamentId, matchBId, randomUUID());
    expect(result.error).toBeDefined();

    const after = await prisma.fieldIncident.findUniqueOrThrow({ where: { id: before!.id } });
    expect(after.status).toBe("OPEN");
  });

  const deviceRefereeB = newDeviceJar();

  it("l'organisateur assigne aussi un arbitre à la cible 2 (support du test de concurrence 22)", async () => {
    asOrganizer();
    const access = await generateRefereeAccess(tournamentId, "2");
    const proof = new URL(access.url!).searchParams.get("proof")!;
    const { redeemRefereeGrant } = await import("@/lib/actions/fieldAccess");
    asAnonymous();
    const redemption = await redeemRefereeGrant(proof, tournamentId);
    expect(redemption).toEqual({ ok: true, matchId: matchBId });

    setActiveDevice(deviceRefereeB);
    await issueFieldSession(tournamentId, matchBId, "REFEREE");
  });

  it("22. concurrence — deux forfaits identiques réellement simultanés (arbitre) convergent, puis l'organisateur rejoue la même décision sans double conséquence", async () => {
    // D'abord une vraie concurrence base de données : deux appels PARALLÈLES du même arbitre
    // (withTournamentLock doit les sérialiser, jamais une double progression).
    asAnonymous();
    setActiveDevice(deviceRefereeB);
    const [c1, c2] = await Promise.all([
      declareForfeit(tournamentId, matchBId, matchBPlayer2),
      declareForfeit(tournamentId, matchBId, matchBPlayer2),
    ]);
    expect(c1.error).toBeUndefined();
    expect(c2.error).toBeUndefined();

    // Puis l'organisateur (autre profil, autre "guichet") rejoue la MÊME décision peu après —
    // cas réel d'une double intervention organisation/arbitre sur le même incident : doit
    // converger sans erreur ni nouvelle conséquence sportive.
    asOrganizer();
    const organizerReplay = await declareForfeit(tournamentId, matchBId, matchBPlayer2);
    expect(organizerReplay.error).toBeUndefined();

    const finished = await prisma.match.findUniqueOrThrow({ where: { id: matchBId } });
    expect(finished.status).toBe("FINISHED");
    expect(finished.winnerId).toBe(matchBPlayer1);
    expect(finished.forfeitedPlayerId).toBe(matchBPlayer2);

    // Une seule promotion réelle sur la cible 2 libérée (pas de double progression concurrente).
    const boardTwoActive = await prisma.match.findMany({ where: { tournamentId, boardNumber: 2, status: "IN_PROGRESS" } });
    expect(boardTwoActive).toHaveLength(1);

    // 21/17 (suite) — l'incident PLAYER_ABSENT concurrent créé plus haut s'auto-résout désormais.
    const incidents = await dbListFieldIncidents(tournamentId);
    expect(incidents.find((fi) => fi.match_id === matchBId && fi.type === "PLAYER_ABSENT")!.status).toBe("RESOLVED");
  });

  // ── Non-régression DO-SCORING / DO-SPORT / DO-FIELD-ACCESS, clôture complète ─

  it("23/24/25. non-régression — saisie X01 normale, progression standard et accès terrain restent inchangés jusqu'à la clôture", async () => {
    asOrganizer();
    let iterations = 0;
    while (iterations < 20) {
      const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
      if (t.status === "FINISHED") break;

      const active = await prisma.match.findFirst({ where: { tournamentId, status: "IN_PROGRESS" } });
      if (!active) break;

      // 23 — DO-SCORING : une vraie saisie X01 traditionnelle via session terrain PLAYER reste
      // fonctionnelle (recordThrow), pas seulement l'arbitrage direct.
      if (active.bracketRound === 2) {
        const sets = await prisma.matchSet.findMany({ where: { matchId: active.id } });
        const deviceSmoke = newDeviceJar();
        asAnonymous();
        setActiveDevice(deviceSmoke);
        await issueFieldSession(tournamentId, active.id, "PLAYER");
        const throwResult = await recordThrow(sets[0].id, tournamentId, 1, 60, randomUUID());
        expect(throwResult.error).toBeUndefined(); // 25 — accès terrain PLAYER toujours fonctionnel
        asOrganizer();
      }

      const sets = await prisma.matchSet.findMany({ where: { matchId: active.id } });
      for (const set of sets) {
        const current = await prisma.matchSet.findUniqueOrThrow({ where: { id: set.id } });
        if (current.winnerId) continue;
        const result = await markWinnerDirect(set.id, active.player1Id!, tournamentId);
        expect(result.error).toBeUndefined();
      }
      iterations++;
    }
    expect(iterations).toBeLessThan(20);

    const finalTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(finalTournament.status).toBe("FINISHED"); // 24 — clôture automatique standard inchangée
  });

  it("12. tournoi terminé — plus aucune mutation terrain n'est acceptée", async () => {
    asAnonymous();
    setActiveDevice(devicePlayerB); // ancienne session PLAYER, tournoi désormais FINISHED
    const result = await reportFieldIncident(tournamentId, matchBId, "OTHER");
    expect(result.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mode rapide — DO-FIELD-INCIDENT-002 a fermé la décision PO restée en attente ici (forfait =
// défaite normale, perte d'une vie via le moteur rapide existant). Couverture déplacée vers
// lib/actions/fieldIncidentQuickForfeit.concurrency.test.ts, dédié — jamais dupliquée ici.
// ─────────────────────────────────────────────────────────────────────────────
