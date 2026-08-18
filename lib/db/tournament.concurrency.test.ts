import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbCreateTournament, dbReserveRegistrationSlot, dbConfirmPendingPayment, dbMarkRefundConfirmed, type ReserveSlotResult } from "./tournament";

/**
 * DARTSOPEN-MONETIZATION-002/003/004 — preuves réelles, contre un vrai PostgreSQL (jamais
 * mocké), des garanties d'atomicité mandatées par les missions successives : idempotence de
 * création de tournoi, réservation de capacité, paiement tardif, remboursement, statut sous
 * verrou. Même discipline que lib/rateLimit.test.ts (SEC-005) : Promise.all sur de vrais appels,
 * jamais une simulation séquentielle — un mock ne peut pas prouver qu'un verrou Postgres tient
 * sous contention réelle.
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

function reserved(r: ReserveSlotResult) {
  if (r.outcome !== "RESERVED") throw new Error(`expected RESERVED, got ${r.outcome}`);
  return r.registration;
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

describe("dbCreateTournament — isolation de idempotencyKey par propriétaire (DARTSOPEN-MONETIZATION-003/004, audit P4/P2)", () => {
  it("A crée un tournoi avec la clé X ; un retry de A avec la même clé X renvoie le même tournoi A", async () => {
    const key = randomUUID();

    const first = await dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A" }), key);
    const retry = await dbCreateTournament("user-a", tournamentInput({ name: "Tournoi A (retry)" }), key);

    expect(retry.id).toBe(first.id);
    createdTournamentIds.push(first.id);

    const rows = await prisma.tournament.count({ where: { userId: "user-a", idempotencyKey: key } });
    expect(rows).toBe(1);
  });

  it("DARTSOPEN-MONETIZATION-004 (P2, contre-audit) : B utilisant la MÊME valeur de idempotencyKey que A (volontairement, même organisation) reçoit son propre tournoi avec son propre id — jamais celui de A, jamais une référence de crédit partagée", async () => {
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

    // La référence effectivement envoyée à SterPlatform pour la consommation de crédit est
    // `tournament.id` (voir lib/actions/tournament.ts) — jamais `idempotencyKey` : A et B ont
    // donc, par construction, des références de consommation distinctes malgré la clé partagée.
    expect(tournamentA.id).not.toBe(tournamentB.id);
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

describe("dbReserveRegistrationSlot — capacité atomique sous concurrence réelle (DARTSOPEN-MONETIZATION-002/004, audit DO-AUD-003/DO-AUD-004, contre-audit P3/P4)", () => {
  async function makeTournament(maxPlayers: number, playersPerTeam = 1, status: "DRAFT" | "OPEN" | "IN_PROGRESS" = "OPEN") {
    const t = await dbCreateTournament(
      "user-capacity",
      tournamentInput({ max_players: maxPlayers, players_per_team: playersPerTeam }),
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    if (status !== "DRAFT") {
      await prisma.tournament.update({ where: { id: t.id }, data: { status } });
    }
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
      Array.from({ length: 11 }, (_, i) => dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(i))),
    );

    const succeeded = results.filter((r) => r.outcome === "RESERVED");
    const refused = results.filter((r) => r.outcome === "FULL");
    expect(succeeded).toHaveLength(10);
    expect(refused).toHaveLength(1);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(10);
  });

  it("deux réservations strictement concurrentes pour la toute dernière place : une seule réussit jamais les deux", async () => {
    const t = await makeTournament(1);

    const [r1, r2] = await Promise.all([
      dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(1)),
      dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(2)),
    ]);

    const succeeded = [r1, r2].filter((r) => r.outcome === "RESERVED");
    expect(succeeded).toHaveLength(1);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(1);
  });

  it("aucun tournoi ne peut jamais dépasser maxPlayers même avec un afflux massif de tentatives concurrentes", async () => {
    const t = await makeTournament(5);

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(i))),
    );

    const succeeded = results.filter((r) => r.outcome === "RESERVED");
    expect(succeeded).toHaveLength(5);

    const occupied = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
    expect(occupied).toBe(5);
    expect(occupied).toBeLessThanOrEqual(5);
  });

  it("une inscription PAID confirmée occupe réellement une place (DO-AUD-003 : jamais laissée PENDING pour un paiement sur place/gratuit)", async () => {
    const t = await makeTournament(1);

    const r = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(1, "PAID"));
    expect(r.outcome).toBe("RESERVED");
    expect(reserved(r).status).toBe("PAID");

    // La place est bien comptée comme occupée : une deuxième tentative doit être refusée.
    const second = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(2, "PAID"));
    expect(second.outcome).toBe("FULL");
  });

  it("une réservation PENDING expirée libère sa place (DO-AUD-009 : jamais un orphelin permanent)", async () => {
    const t = await makeTournament(1);

    const expired = await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation(1, "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    });
    expect(expired.outcome).toBe("RESERVED");

    // La réservation a expiré : la place est de nouveau disponible pour un nouvel arrivant.
    const next = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(2, "PAID"));
    expect(next.outcome).toBe("RESERVED");
  });

  it("une réservation PENDING non expirée occupe la place (paiement en ligne en cours de checkout)", async () => {
    const t = await makeTournament(1);

    const pending = await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation(1, "PENDING"),
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    expect(pending.outcome).toBe("RESERVED");

    const blocked = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(2, "PAID"));
    expect(blocked.outcome).toBe("FULL");
  });

  describe("formule de capacité après ajout, équipes non divisibles (DARTSOPEN-MONETIZATION-004, contre-audit P3)", () => {
    it("maxPlayers=10, playersPerTeam=3 : 3 équipes acceptées (9 joueurs), la 4e équipe refusée (dépasserait 10)", async () => {
      const t = await makeTournament(10, 3);

      const first = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-1"));
      const second = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-2"));
      const third = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-3"));
      const fourth = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-4"));

      expect(first.outcome).toBe("RESERVED");
      expect(second.outcome).toBe("RESERVED");
      expect(third.outcome).toBe("RESERVED");
      expect(fourth.outcome).toBe("FULL");

      const occupiedTeams = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
      expect(occupiedTeams).toBe(3);
      expect(occupiedTeams * 3).toBeLessThanOrEqual(10);
    });

    it("sous forte concurrence réelle, maxPlayers=10/playersPerTeam=3 ne dépasse jamais 10 joueurs (jamais 4 équipes acceptées)", async () => {
      const t = await makeTournament(10, 3);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(`concurrent-${i}`))),
      );

      const succeeded = results.filter((r) => r.outcome === "RESERVED");
      expect(succeeded).toHaveLength(3);

      const occupiedTeams = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
      expect(occupiedTeams).toBe(3);
      expect(occupiedTeams * 3).toBeLessThanOrEqual(10);
    });
  });

  describe("revérification du statut du tournoi sous verrou (DARTSOPEN-MONETIZATION-004, contre-audit P4)", () => {
    it("un tournoi passé IN_PROGRESS après la lecture initiale de l'appelant refuse toute nouvelle réservation publique, même avec de la capacité libre", async () => {
      const t = await makeTournament(10, 1, "IN_PROGRESS");

      const result = await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation(1));

      expect(result.outcome).toBe("NOT_OPEN");
      const occupied = await prisma.registration.count({ where: { tournamentId: t.id } });
      expect(occupied).toBe(0);
    });

    it("l'ajout organisateur (DRAFT autorisé) reste possible en DRAFT mais refuse IN_PROGRESS", async () => {
      const draft = await makeTournament(10, 1, "DRAFT");
      const inProgress = await makeTournament(10, 1, "IN_PROGRESS");

      const draftResult = await dbReserveRegistrationSlot(draft.id, ["DRAFT", "OPEN"], reservation(1));
      const inProgressResult = await dbReserveRegistrationSlot(inProgress.id, ["DRAFT", "OPEN"], reservation(1));

      expect(draftResult.outcome).toBe("RESERVED");
      expect(inProgressResult.outcome).toBe("NOT_OPEN");
    });
  });
});

describe("dbConfirmPendingPayment — paiement tardif après reprise de la place (DARTSOPEN-MONETIZATION-003/004, contre-audit P1/P3/P4)", () => {
  async function makeTournament(maxPlayers: number, playersPerTeam = 1) {
    const t = await dbCreateTournament(
      "user-late-payment",
      tournamentInput({ max_players: maxPlayers, players_per_team: playersPerTeam }),
      randomUUID(),
    );
    createdTournamentIds.push(t.id);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "OPEN" } });
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
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));

    // 2. La réservation de A a expiré : B prend légitimement la dernière place.
    const b = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("B", "PAID")));

    // 3. Le paiement de A arrive tardivement (webhook payment.succeeded) — jamais transformé
    // en PAID : la capacité a été reprise par B. Un remboursement est nécessaire mais pas
    // encore confirmé financièrement (DARTSOPEN-MONETIZATION-004 P1 : jamais REFUNDED avant
    // confirmation réelle).
    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("REFUND_NEEDED");

    // 4. État final : exactement maxPlayers (1) — B occupe la place, A n'est jamais compté en
    // plus, A n'est jamais silencieusement resté PENDING (traitement financier explicite).
    const occupied = await prisma.registration.count({
      where: { tournamentId: t.id, status: "PAID" },
    });
    expect(occupied).toBe(1);

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(aRow.status).toBe("REFUND_PENDING");
    expect(aRow.reservationExpiresAt).toBeNull();

    const bRow = await prisma.registration.findUniqueOrThrow({ where: { id: b.id } });
    expect(bRow.status).toBe("PAID");
  });

  it("DARTSOPEN-MONETIZATION-004 (P1) : REFUNDED n'est jamais atteint directement — seul dbMarkRefundConfirmed(), appelé après confirmation financière réelle, y transitionne depuis REFUND_PENDING", async () => {
    const t = await makeTournament(1);
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));
    await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("B", "PAID"));

    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("REFUND_NEEDED");

    let row = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("REFUND_PENDING");
    expect(row.status).not.toBe("REFUNDED");

    // Seule la confirmation financière réelle transitionne vers REFUNDED.
    await dbMarkRefundConfirmed(a.id);
    row = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("REFUNDED");
  });

  it("dbMarkRefundConfirmed est idempotent : appelé deux fois, aucun effet la seconde fois, jamais une erreur", async () => {
    const t = await makeTournament(1);
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));
    await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("B", "PAID"));
    await dbConfirmPendingPayment(a.id);

    await dbMarkRefundConfirmed(a.id);
    await dbMarkRefundConfirmed(a.id);

    const row = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("REFUNDED");
  });

  it("une redélivraison du webhook alors que le remboursement est encore REFUND_PENDING renvoie REFUND_IN_PROGRESS (le retry), jamais NOT_FOUND", async () => {
    const t = await makeTournament(1);
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));
    await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("B", "PAID"));
    await dbConfirmPendingPayment(a.id); // -> REFUND_NEEDED, transitionne en REFUND_PENDING

    const retry = await dbConfirmPendingPayment(a.id);
    expect(retry).toBe("REFUND_IN_PROGRESS");
  });

  it("une fois REFUNDED confirmé, une redélivraison ultérieure renvoie ALREADY_REFUNDED, jamais une nouvelle transition", async () => {
    const t = await makeTournament(1);
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));
    await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("B", "PAID"));
    await dbConfirmPendingPayment(a.id);
    await dbMarkRefundConfirmed(a.id);

    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("ALREADY_REFUNDED");
  });

  it("réservation encore valide : le paiement (même arrivé après coup) confirme normalement, la place n'a jamais été à risque", async () => {
    const t = await makeTournament(1);

    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }));

    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("CONFIRMED");

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(aRow.status).toBe("PAID");
  });

  it("réservation expirée mais la place n'a jamais été reprise : confirme quand même (capacité revérifiée, pas juste supposée perdue)", async () => {
    const t = await makeTournament(1);

    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      ...reservation("A", "PENDING"),
      reservationExpiresAt: new Date(Date.now() - 1000),
    }));

    // Personne d'autre n'a pris la place — le paiement tardif de A peut être confirmé.
    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("CONFIRMED");

    const aRow = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
    expect(aRow.status).toBe("PAID");
  });

  it("redélivraison du webhook (déjà PAID) : ALREADY_CONFIRMED, jamais une seconde transition", async () => {
    const t = await makeTournament(1);
    const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("A", "PAID")));

    const result = await dbConfirmPendingPayment(a.id);
    expect(result).toBe("ALREADY_CONFIRMED");
  });

  it("inscription introuvable : NOT_FOUND", async () => {
    const result = await dbConfirmPendingPayment(randomUUID());
    expect(result).toBe("NOT_FOUND");
  });

  describe("formule de capacité après ajout, équipes non divisibles (DARTSOPEN-MONETIZATION-004, contre-audit P3, chemin paiement tardif)", () => {
    it("maxPlayers=10, playersPerTeam=3 : une 4e équipe (paiement tardif, réservation expirée) n'est jamais confirmée si 3 équipes occupent déjà 9 places", async () => {
      const t = await makeTournament(10, 3);

      const late = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
        ...reservation("late", "PENDING"),
        reservationExpiresAt: new Date(Date.now() - 1000),
      }));
      await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-1"));
      await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-2"));
      await dbReserveRegistrationSlot(t.id, ["OPEN"], reservation("équipe-3"));

      const result = await dbConfirmPendingPayment(late.id);
      expect(result).toBe("REFUND_NEEDED");

      const occupiedTeams = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
      expect(occupiedTeams).toBe(3);
      expect(occupiedTeams * 3).toBeLessThanOrEqual(10);
    });
  });

  describe("revérification du statut du tournoi sous verrou (DARTSOPEN-MONETIZATION-004, contre-audit P4, chemin paiement tardif)", () => {
    it("un paiement Stripe arrivant après passage à IN_PROGRESS n'est jamais confirmé, même si la réservation était encore valide et la capacité disponible", async () => {
      const t = await makeTournament(10, 1);

      const a = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
        ...reservation("A", "PENDING"),
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // encore valide
      }));

      // Le tournoi démarre pendant que le paiement de A est encore en cours.
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });

      const result = await dbConfirmPendingPayment(a.id);
      expect(result).toBe("REFUND_NEEDED");

      const row = await prisma.registration.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.status).toBe("REFUND_PENDING");
      // Jamais compté comme occupant une place PAID dans un tournoi déjà démarré sans elle.
      const paidCount = await prisma.registration.count({ where: { tournamentId: t.id, status: "PAID" } });
      expect(paidCount).toBe(0);
    });
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
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "OPEN" } });
    return t;
  }

  it("gratuit/sur place (confirmation immédiate) : PAID mais feeCollected reste false — aucun encaissement n'a jamais eu lieu", async () => {
    const t = await makeTournament(4);

    const r = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      playerName: "Équipe gratuite",
      playerEmail: "free@example.com",
      playerNames: ["Alice"],
      platformFeeCents: 0,
      status: "PAID",
    }));

    const row = await prisma.registration.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe("PAID");
    expect(row.feeCollected).toBe(false);
  });

  it("paiement en ligne confirmé : PAID et feeCollected true — Stripe a réellement encaissé", async () => {
    const t = await makeTournament(4);

    const r = reserved(await dbReserveRegistrationSlot(t.id, ["OPEN"], {
      playerName: "Équipe en ligne",
      playerEmail: "online@example.com",
      playerNames: ["Bob"],
      platformFeeCents: 0,
      status: "PENDING",
      reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }));

    const result = await dbConfirmPendingPayment(r.id);
    expect(result).toBe("CONFIRMED");

    const row = await prisma.registration.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe("PAID");
    expect(row.feeCollected).toBe(true);
  });
});
