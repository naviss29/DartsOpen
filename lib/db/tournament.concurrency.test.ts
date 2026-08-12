import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbCreateTournament, dbReserveRegistrationSlot } from "./tournament";

/**
 * DARTSOPEN-MONETIZATION-002 — preuves réelles, contre un vrai PostgreSQL (jamais mocké),
 * des deux garanties d'atomicité mandatées par la mission : idempotence de création de
 * tournoi (P1, DO-AUD-001/DO-AUD-002) et réservation de capacité (P2, DO-AUD-003/DO-AUD-004).
 * Même discipline que lib/rateLimit.test.ts (SEC-005) : Promise.all sur de vrais appels
 * `dbCreateTournament`/`dbReserveRegistrationSlot`, jamais une simulation séquentielle — un
 * mock ne peut pas prouver qu'un verrou Postgres tient sous contention réelle.
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

function tournamentInput(overrides: Partial<Parameters<typeof dbCreateTournament>[1]> = {}) {
  return {
    name: "Tournoi concurrence",
    date: "2026-09-01",
    location: "Salle des fêtes",
    max_players: 32,
    entry_fee: 0,
    nb_pools: 1,
    nb_boards: 2,
    advancement_per_pool: 1,
    players_per_team: 2,
    registration_mode: "ONLINE",
    payment_mode: "ONSITE",
    scoring_mode: "ELECTRONIC",
    ...overrides,
  };
}

describe("dbCreateTournament — idempotence sous concurrence réelle (DARTSOPEN-MONETIZATION-002, audit DO-AUD-001/DO-AUD-002)", () => {
  it("N créations concurrentes avec la même clé d'idempotence (double-clic/retry) ne créent qu'un seul tournoi", async () => {
    const idempotencyKey = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        dbCreateTournament(`user-${i}`, tournamentInput({ name: `Tournoi concurrence ${i}` }), idempotencyKey),
      ),
    );

    const uniqueIds = new Set(results.map((t) => t.id));
    expect(uniqueIds.size).toBe(1);
    createdTournamentIds.push(...uniqueIds);

    const rows = await prisma.tournament.count({ where: { idempotencyKey } });
    expect(rows).toBe(1);
  });

  it("deux clés d'idempotence distinctes (deux formulaires réellement différents) créent bien deux tournois", async () => {
    const keyA = randomUUID();
    const keyB = randomUUID();

    const [a, b] = await Promise.all([
      dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A" }), keyA),
      dbCreateTournament("user-b", tournamentInput({ name: "Tournoi B" }), keyB),
    ]);

    expect(a.id).not.toBe(b.id);
    createdTournamentIds.push(a.id, b.id);
  });
});

describe("dbReserveRegistrationSlot — capacité atomique sous concurrence réelle (DARTSOPEN-MONETIZATION-002, audit DO-AUD-003/DO-AUD-004)", () => {
  async function makeTournament(maxPlayers: number, playersPerTeam = 1) {
    const t = await dbCreateTournament(
      "user-capacity",
      tournamentInput({ max_players: maxPlayers, players_per_team: playersPerTeam }),
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    return t;
  }

  function reservation(i: number, status: "PAID" | "PENDING" = "PAID") {
    return {
      playerName: `Joueur ${i}`,
      playerEmail: `joueur-${i}-${randomUUID()}@example.com`,
      playerNames: [`Joueur ${i}`],
      platformFeeCents: 0,
      status,
    };
  }

  it("maxPlayers=10 : 10 réservations concurrentes réussissent, la 11e est refusée", async () => {
    const t = await makeTournament(10);

    const results = await Promise.all(
      Array.from({ length: 11 }, (_, i) => dbReserveRegistrationSlot(t.id, 10, 1, reservation(i))),
    );

    const succeeded = results.filter((r) => r !== null);
    const refused = results.filter((r) => r === null);
    expect(succeeded).toHaveLength(10);
    expect(refused).toHaveLength(1);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(10);
  });

  it("deux réservations strictement concurrentes pour la toute dernière place : une seule réussit jamais les deux", async () => {
    const t = await makeTournament(1);

    const [r1, r2] = await Promise.all([
      dbReserveRegistrationSlot(t.id, 1, 1, reservation(1)),
      dbReserveRegistrationSlot(t.id, 1, 1, reservation(2)),
    ]);

    const succeeded = [r1, r2].filter((r) => r !== null);
    expect(succeeded).toHaveLength(1);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(1);
  });

  it("aucun tournoi ne peut jamais dépasser maxPlayers même avec un afflux massif de tentatives concurrentes", async () => {
    const t = await makeTournament(5);

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => dbReserveRegistrationSlot(t.id, 5, 1, reservation(i))),
    );

    const succeeded = results.filter((r) => r !== null);
    expect(succeeded).toHaveLength(5);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(5);
    expect(occupied).toBeLessThanOrEqual(5);
  });

  it("une inscription PAID confirmée occupe réellement une place (DO-AUD-003 : jamais laissée PENDING pour un paiement sur place/gratuit)", async () => {
    const t = await makeTournament(1);

    const r = await dbReserveRegistrationSlot(t.id, 1, 1, reservation(1, "PAID"));
    expect(r).not.toBeNull();
    expect(r!.status).toBe("PAID");

    // La place est bien comptée comme occupée : une deuxième tentative doit être refusée.
    const second = await dbReserveRegistrationSlot(t.id, 1, 1, reservation(2, "PAID"));
    expect(second).toBeNull();
  });

  it("une réservation PENDING expirée libère sa place (DO-AUD-009 : jamais un orphelin permanent)", async () => {
    const t = await makeTournament(1);

    const expired = await dbReserveRegistrationSlot(t.id, 1, 1, {
      ...reservation(1, "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    });
    expect(expired).not.toBeNull();

    // La réservation a expiré : la place est de nouveau disponible pour un nouvel arrivant.
    const next = await dbReserveRegistrationSlot(t.id, 1, 1, reservation(2, "PAID"));
    expect(next).not.toBeNull();
  });

  it("une réservation PENDING non expirée occupe la place (paiement en ligne en cours de checkout)", async () => {
    const t = await makeTournament(1);

    const pending = await dbReserveRegistrationSlot(t.id, 1, 1, {
      ...reservation(1, "PENDING"),
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    expect(pending).not.toBeNull();

    const blocked = await dbReserveRegistrationSlot(t.id, 1, 1, reservation(2, "PAID"));
    expect(blocked).toBeNull();
  });
});
