// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { dbCreateTournament, dbReserveRegistrationSlot } from "./tournament";

/**
 * F17 (audit du 04/10/2026) — contrôles de l'inscription publique pris SOUS le verrou du tournoi,
 * contre un vrai PostgreSQL : mode d'inscription et taille d'équipe relus dans la transaction,
 * jamais la valeur lue par l'appelant avant (l'organisateur peut l'avoir modifiée entre-temps).
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function openTournament(overrides: { registration_mode?: string; players_per_team?: number } = {}) {
  const t = await dbCreateTournament(
    "user-f17",
    {
      name: "Tournoi F17",
      date: "2026-09-01",
      location: "Salle",
      max_players: 16,
      entry_fee: 0,
      nb_pools: 1,
      nb_boards: 2,
      advancement_per_pool: 1,
      players_per_team: overrides.players_per_team ?? 2,
      registration_mode: overrides.registration_mode ?? "ONLINE",
      payment_mode: "ONSITE",
      scoring_mode: "ELECTRONIC",
    },
    randomUUID(),
  );
  createdTournamentIds.push(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "OPEN" } });
  return t.id;
}

const reservation = (playerNames: string[]) => ({
  playerName: "Équipe F17",
  playerEmail: "f17@example.test",
  playerNames,
  platformFeeCents: 0,
  status: "PAID" as const,
});

const count = (tournamentId: string) => prisma.registration.count({ where: { tournamentId } });

describe("dbReserveRegistrationSlot — inscription publique (F17)", () => {
  it("tournoi en inscription sur place : refusé en public, aucune ligne ; l'ajout organisateur reste possible", async () => {
    const t = await openTournament({ registration_mode: "ONSITE" });

    const pub = await dbReserveRegistrationSlot(t, ["OPEN"], reservation(["A", "B"]), { publicRegistration: true });
    expect(pub).toEqual({ outcome: "ONLINE_REGISTRATION_DISABLED" });
    expect(await count(t)).toBe(0);

    const organizer = await dbReserveRegistrationSlot(t, ["DRAFT", "OPEN"], reservation(["A", "B"]));
    expect(organizer.outcome).toBe("RESERVED");
  });

  it.each([[["A"]], [["A", "B", "C"]]])("taille d'équipe incorrecte %j : refusée avec le nombre attendu, aucune ligne", async (names) => {
    const t = await openTournament({ players_per_team: 2 });

    const r = await dbReserveRegistrationSlot(t, ["OPEN"], reservation(names), { publicRegistration: true });
    expect(r).toEqual({ outcome: "INVALID_TEAM_SIZE", expected: 2 });
    expect(await count(t)).toBe(0);
  });

  it("taille exacte : acceptée", async () => {
    const t = await openTournament({ players_per_team: 2 });
    const r = await dbReserveRegistrationSlot(t, ["OPEN"], reservation(["A", "B"]), { publicRegistration: true });
    expect(r.outcome).toBe("RESERVED");
  });

  it("valeurs relues sous le verrou : un passage en ONSITE ou un changement de taille juste avant la réservation est pris en compte", async () => {
    const t = await openTournament({ players_per_team: 2 });

    await prisma.tournament.update({ where: { id: t }, data: { playersPerTeam: 3 } });
    expect(await dbReserveRegistrationSlot(t, ["OPEN"], reservation(["A", "B"]), { publicRegistration: true }))
      .toEqual({ outcome: "INVALID_TEAM_SIZE", expected: 3 });

    await prisma.tournament.update({ where: { id: t }, data: { registrationMode: "ONSITE" } });
    expect(await dbReserveRegistrationSlot(t, ["OPEN"], reservation(["A", "B", "C"]), { publicRegistration: true }))
      .toEqual({ outcome: "ONLINE_REGISTRATION_DISABLED" });
    expect(await count(t)).toBe(0);
  });
});
