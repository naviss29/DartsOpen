// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbConfirmPendingPayment, dbCreateTournament, dbReserveRegistrationSlot } from "./tournament";
import { dbGetRegistrationPaymentStatus } from "./registrationPaymentStatus";
import { onlinePaymentState } from "@/lib/registration/successPayment";

/**
 * Page de retour de paiement, contre un vrai PostgreSQL : l'état lu avant puis après le webhook
 * (`dbConfirmPendingPayment`, appelé par la route webhook) — jamais le retour navigateur.
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function openPaidTournament() {
  const t = await dbCreateTournament(
    "user-retour-paiement",
    {
      name: "Tournoi retour paiement",
      date: "2099-09-01",
      location: "Salle",
      max_players: 16,
      entry_fee: 500,
      nb_pools: 1,
      nb_boards: 2,
      advancement_per_pool: 1,
      players_per_team: 1,
      registration_mode: "ONLINE",
      payment_mode: "ONLINE",
      scoring_mode: "ELECTRONIC",
    },
    randomUUID(),
  );
  createdTournamentIds.push(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "OPEN" } });
  return t.id;
}

async function reservePending(tournamentId: string, reservationExpiresAt: Date) {
  const r = await dbReserveRegistrationSlot(tournamentId, ["OPEN"], {
    playerName: "Alex",
    playerEmail: "alex@example.test",
    playerNames: ["Alex"],
    platformFeeCents: 0,
    status: "PENDING",
    reservationExpiresAt,
  }, { publicRegistration: true });
  if (r.outcome !== "RESERVED") throw new Error(`réservation refusée : ${r.outcome}`);
  return r.registration.id;
}

const inThirtyMinutes = () => new Date(Date.now() + 30 * 60_000);

describe("dbGetRegistrationPaymentStatus — page de retour de paiement", () => {
  it("retour AVANT le webhook : en attente ; APRÈS le webhook : confirmé", async () => {
    const t = await openPaidTournament();
    const id = await reservePending(t, inThirtyMinutes());

    const before = await dbGetRegistrationPaymentStatus(id, t);
    expect(before?.status).toBe("PENDING");
    expect(onlinePaymentState(before, new Date())).toBe("pending");

    expect(await dbConfirmPendingPayment(id)).toBe("CONFIRMED");

    const after = await dbGetRegistrationPaymentStatus(id, t);
    expect(after?.status).toBe("PAID");
    expect(onlinePaymentState(after, new Date())).toBe("confirmed");
  });

  it("réservation expirée sans webhook : échec affiché, jamais « confirmé »", async () => {
    const t = await openPaidTournament();
    const id = await reservePending(t, inThirtyMinutes());
    await prisma.registration.update({ where: { id }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });

    expect(onlinePaymentState(await dbGetRegistrationPaymentStatus(id, t), new Date())).toBe("expired");
  });

  it("inscription d'un autre tournoi ou identifiant mal formé : rien n'est lu", async () => {
    const t = await openPaidTournament();
    const other = await openPaidTournament();
    const id = await reservePending(t, inThirtyMinutes());

    expect(await dbGetRegistrationPaymentStatus(id, other)).toBeNull();
    expect(await dbGetRegistrationPaymentStatus("pas-un-uuid", t)).toBeNull();
    expect(await dbGetRegistrationPaymentStatus(randomUUID(), t)).toBeNull();
  });
});
