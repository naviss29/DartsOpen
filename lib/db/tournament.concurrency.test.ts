import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbCreateTournament, dbReserveRegistrationSlot, dbConfirmPendingPayment } from "./tournament";

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
  it("N créations concurrentes du MÊME utilisateur avec la même clé d'idempotence (double-clic/retry) ne créent qu'un seul tournoi", async () => {
    const idempotencyKey = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        dbCreateTournament("user-concurrent", tournamentInput({ name: `Tournoi concurrence ${i}` }), idempotencyKey),
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

describe("dbCreateTournament — isolation de idempotencyKey par propriétaire (DARTSOPEN-MONETIZATION-003, audit P4)", () => {
  it("A crée un tournoi avec la clé X ; un retry de A avec la même clé X renvoie le même tournoi A", async () => {
    const key = randomUUID();

    const first = await dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A" }), key);
    const retry = await dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A (retry)" }), key);

    expect(retry.id).toBe(first.id);
    createdTournamentIds.push(first.id);

    const rows = await prisma.tournament.count({ where: { userId: "user-a", idempotencyKey: key } });
    expect(rows).toBe(1);
  });

  it("B utilisant la MÊME valeur de clé que A reçoit son propre tournoi, jamais celui de A", async () => {
    const sharedKeyValue = randomUUID();

    const tournamentA = await dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A" }), sharedKeyValue);
    const tournamentB = await dbCreateTournament("user-b", tournamentInput({ name: "Tournoi B" }), sharedKeyValue);

    expect(tournamentB.id).not.toBe(tournamentA.id);
    expect(tournamentB.association_id).toBe("user-b");
    createdTournamentIds.push(tournamentA.id, tournamentB.id);

    // B ne doit jamais pouvoir retrouver/reprendre le tournoi de A avec cette même valeur de clé.
    const bRetry = await dbCreateTournament("user-b", tournamentInput({ name: "Tournoi B (retry)" }), sharedKeyValue);
    expect(bRetry.id).toBe(tournamentB.id);
    expect(bRetry.id).not.toBe(tournamentA.id);
  });

  it("concurrence réelle : N tentatives du MÊME utilisateur avec la MÊME clé, en présence d'un autre utilisateur utilisant la même valeur de clé → exactement un tournoi par utilisateur", async () => {
    const sharedKeyValue = randomUUID();

    const [aResults, bResult] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          dbCreateTournament("user-a", tournamentInput({ name: `Tournoi A concurrent ${i}` }), sharedKeyValue),
        ),
      ),
      dbCreateTournament("user-b", tournamentInput({ name: "Tournoi B" }), sharedKeyValue),
    ]);

    const uniqueAIds = new Set(aResults.map((t) => t.id));
    // Un seul tournoi pour user-a malgré 5 tentatives concurrentes avec la même clé.
    expect(uniqueAIds.size).toBe(1);
    expect(bResult.association_id).toBe("user-b");
    expect([...uniqueAIds][0]).not.toBe(bResult.id);
    createdTournamentIds.push(...uniqueAIds, bResult.id);

    const countA = await prisma.tournament.count({ where: { userId: "user-a", idempotencyKey: sharedKeyValue } });
    const countB = await prisma.tournament.count({ where: { userId: "user-b", idempotencyKey: sharedKeyValue } });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
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

  function reservation(i: string | number, status: "PAID" | "PENDING" = "PAID") {
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

describe("dbConfirmPendingPayment — paiement tardif après reprise de la place (DARTSOPEN-MONETIZATION-003, contre-audit P1)", () => {
  async function makeTournament(maxPlayers: number, playersPerTeam = 1) {
    const t = await dbCreateTournament(
      "user-late-payment",
      tournamentInput({ max_players: maxPlayers, players_per_team: playersPerTeam }),
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    return t;
  }

  function reservation(i: string | number, status: "PAID" | "PENDING" = "PAID") {
    return {
      playerName: `Joueur ${i}`,
      playerEmail: `joueur-${i}-${randomUUID()}@example.com`,
      playerNames: [`Joueur ${i}`],
      platformFeeCents: 0,
      status,
    };
  }

  it("scénario exact du contre-audit : A réserve la dernière place en ligne, sa réservation expire, B prend la place, le paiement tardif de A n'est jamais confirmé — l'état final reste exactement à maxPlayers", async () => {
    const t = await makeTournament(1);

    // 1. A réserve la dernière place en ligne — réservation déjà expirée au moment de la
    // création, pour simuler de façon déterministe "la réservation a expiré" sans dépendre
    // d'un vrai délai d'attente.
    const a = await dbReserveRegistrationSlot(t.id, 1, 1, {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    });
    expect(a).not.toBeNull();

    // 2. La réservation de A a expiré : B prend légitimement la dernière place.
    const b = await dbReserveRegistrationSlot(t.id, 1, 1, reservation("B", "PAID"));
    expect(b).not.toBeNull();

    // 3. Le paiement de A arrive tardivement (webhook payment.succeeded) — jamais transformé
    // en PAID : la capacité a été reprise par B.
    const result = await dbConfirmPendingPayment(a!.id);
    expect(result).toBe("CAPACITY_LOST");

    // 4. État final : exactement maxPlayers (1) — B occupe la place, A n'est jamais compté en
    // plus, A n'est jamais silencieusement resté PENDING (traitement financier explicite).
    const occupied = await prisma.registration.count({
      where: { tournamentId: t.id, status: "PAID" },
    });
    expect(occupied).toBe(1);

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a!.id } });
    expect(aRow.status).toBe("REFUNDED");
    expect(aRow.reservationExpiresAt).toBeNull();

    const bRow = await prisma.registration.findUniqueOrThrow({ where: { id: b!.id } });
    expect(bRow.status).toBe("PAID");
  });

  it("réservation encore valide : le paiement (même arrivé après coup) confirme normalement, la place n'a jamais été à risque", async () => {
    const t = await makeTournament(1);

    const a = await dbReserveRegistrationSlot(t.id, 1, 1, {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    expect(a).not.toBeNull();

    const result = await dbConfirmPendingPayment(a!.id);
    expect(result).toBe("CONFIRMED");

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a!.id } });
    expect(aRow.status).toBe("PAID");
  });

  it("réservation expirée mais la place n'a jamais été reprise : confirme quand même (capacité revérifiée, pas juste supposée perdue)", async () => {
    const t = await makeTournament(1);

    const a = await dbReserveRegistrationSlot(t.id, 1, 1, {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    });
    expect(a).not.toBeNull();

    // Personne d'autre n'a pris la place — le paiement tardif de A peut être confirmé.
    const result = await dbConfirmPendingPayment(a!.id);
    expect(result).toBe("CONFIRMED");

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a!.id } });
    expect(aRow.status).toBe("PAID");
  });

  it("redélivraison du webhook (déjà PAID) : ALREADY_CONFIRMED, jamais une seconde transition", async () => {
    const t = await makeTournament(1);
    const a = await dbReserveRegistrationSlot(t.id, 1, 1, reservation("A", "PAID"));

    const result = await dbConfirmPendingPayment(a!.id);
    expect(result).toBe("ALREADY_CONFIRMED");
  });

  it("inscription introuvable : NOT_FOUND", async () => {
    const result = await dbConfirmPendingPayment(randomUUID());
    expect(result).toBe("NOT_FOUND");
  });
});

describe("Sémantique PAID/feeCollected (DARTSOPEN-MONETIZATION-003, contre-audit P6) — PAID seul ne prouve jamais un encaissement réel", () => {
  async function makeTournament(maxPlayers: number, playersPerTeam = 1) {
    const t = await dbCreateTournament(
      "user-fee-semantics",
      tournamentInput({ max_players: maxPlayers, players_per_team: playersPerTeam }),
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    return t;
  }

  it("gratuit/sur place (confirmation immédiate) : PAID mais feeCollected reste false — aucun encaissement n'a jamais eu lieu", async () => {
    const t = await makeTournament(4);

    const r = await dbReserveRegistrationSlot(t.id, 4, 1, {
      playerName: "Équipe gratuite",
      playerEmail: "free@example.com",
      playerNames: ["Alice"],
      platformFeeCents: 0,
      status: "PAID",
    });

    const row = await prisma.registration.findUniqueOrThrow({ where: { id: r!.id } });
    expect(row.status).toBe("PAID");
    expect(row.feeCollected).toBe(false);
  });

  it("paiement en ligne confirmé : PAID et feeCollected true — Stripe a réellement encaissé", async () => {
    const t = await makeTournament(4);

    const r = await dbReserveRegistrationSlot(t.id, 4, 1, {
      playerName: "Équipe en ligne",
      playerEmail: "online@example.com",
      playerNames: ["Bob"],
      platformFeeCents: 0,
      status: "PENDING",
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const result = await dbConfirmPendingPayment(r!.id);
    expect(result).toBe("CONFIRMED");

    const row = await prisma.registration.findUniqueOrThrow({ where: { id: r!.id } });
    expect(row.status).toBe("PAID");
    expect(row.feeCollected).toBe(true);
  });
});
