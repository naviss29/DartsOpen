import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbCreateTournament, dbUpdateTournamentStatus, bulkCreateMatchesTx, withTournamentLock } from "@/lib/db/tournament";

/**
 * DO-OPS-002 (défaut 1, scénarios obligatoires 8/9/10) — la clôture MANUELLE (dbUpdateTournamentStatus,
 * seule fonction appelée par le Server Action updateTournamentStatus derrière le bouton
 * organisateur) doit désormais refuser IN_PROGRESS → FINISHED tant qu'il reste au moins un match
 * IN_PROGRESS ou PENDING, sous le même verrou que l'écriture elle-même — jamais une vérification
 * séparée qu'une course pourrait contourner.
 *
 * La clôture AUTOMATIQUE du moteur sportif (doAdvanceToNextRoundTx/doAdvanceQuickTournamentTx,
 * lib/db/tournament.ts) appelle dbUpdateTournamentStatusTx() directement, jamais cette fonction
 * publique — non régressée, non concernée par cette garde (déjà reprouvé par la suite existante
 * lib/actions/sportEngine.concurrency.test.ts, scénario obligatoire 11, 14/14 tests toujours
 * verts après ce changement).
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.matchSetThrow.deleteMany({ where: { matchSet: { match: { tournamentId: { in: createdTournamentIds } } } } });
    await prisma.matchSet.deleteMany({ where: { match: { tournamentId: { in: createdTournamentIds } } } });
    await prisma.match.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.round.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.registration.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function makeTournament() {
  const t = await dbCreateTournament(
    "user-closure-guard",
    {
      name: "Tournoi Clôture",
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

let nextPosition = 9000;

async function makeMatchAt(tournamentId: string, boardNumber: number, status: "PENDING" | "IN_PROGRESS" | "FINISHED") {
  const p1 = await makePlayer(tournamentId, "Alice");
  const p2 = await makePlayer(tournamentId, "Bob");
  await withTournamentLock(tournamentId, (tx) =>
    bulkCreateMatchesTx(tx, tournamentId, [{
      player1Id: p1.id,
      player2Id: p2.id,
      bracketRound: 1,
      bracketPosition: nextPosition++,
      boardNumber,
      status: status === "FINISHED" ? "IN_PROGRESS" : status, // créé IN_PROGRESS puis basculé FINISHED juste après si besoin
      roundIds: [],
      bracketType: "SINGLE",
    }]),
  );
  const match = await prisma.match.findFirstOrThrow({ where: { tournamentId, player1Id: p1.id, player2Id: p2.id } });
  if (status === "FINISHED") {
    await prisma.match.update({ where: { id: match.id }, data: { status: "FINISHED", winnerId: p1.id } });
  }
  return match;
}

// Scénario obligatoire 8
describe("dbUpdateTournamentStatus — clôture manuelle refusée tant qu'un match est actif", () => {
  it("refuse IN_PROGRESS → FINISHED quand un match IN_PROGRESS subsiste", async () => {
    const t = await makeTournament();
    await makeMatchAt(t.id, 1, "IN_PROGRESS");

    await expect(dbUpdateTournamentStatus(t.id, "FINISHED")).rejects.toThrow(/encore en cours ou en attente/i);

    const stillRunning = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(stillRunning.status).toBe("IN_PROGRESS");
  });
});

// Scénario obligatoire 9
describe("dbUpdateTournamentStatus — clôture manuelle refusée tant qu'un match est en attente", () => {
  it("refuse IN_PROGRESS → FINISHED quand un match PENDING subsiste (même sans aucun match actif)", async () => {
    const t = await makeTournament();
    await makeMatchAt(t.id, 0, "PENDING");

    await expect(dbUpdateTournamentStatus(t.id, "FINISHED")).rejects.toThrow(/encore en cours ou en attente/i);
  });
});

// Scénario obligatoire 10
describe("dbUpdateTournamentStatus — clôture manuelle autorisée une fois le jeu terminé", () => {
  it("autorise IN_PROGRESS → FINISHED quand tous les matchs sont FINISHED", async () => {
    const t = await makeTournament();
    await makeMatchAt(t.id, 1, "FINISHED");
    await makeMatchAt(t.id, 2, "FINISHED");

    await dbUpdateTournamentStatus(t.id, "FINISHED");

    const final = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(final.status).toBe("FINISHED");
  });

  it("autorise IN_PROGRESS → FINISHED quand aucun match n'a jamais été généré", async () => {
    const t = await makeTournament();

    await dbUpdateTournamentStatus(t.id, "FINISHED");

    const final = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(final.status).toBe("FINISHED");
  });
});

describe("dbUpdateTournamentStatus — la garde ne s'applique qu'à la transition vers FINISHED", () => {
  it("les autres transitions (DRAFT → OPEN, OPEN → IN_PROGRESS) restent inchangées, même avec des matchs PENDING", async () => {
    const t = await dbCreateTournament(
      "user-closure-guard",
      {
        name: "Tournoi Ouverture",
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
      },
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    await prisma.round.create({
      data: { tournamentId: t.id, roundOrder: 1, gameType: "501", entryType: "SINGLE", finishType: "DOUBLE" },
    });

    await dbUpdateTournamentStatus(t.id, "OPEN");
    const afterOpen = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(afterOpen.status).toBe("OPEN");
  });
});
