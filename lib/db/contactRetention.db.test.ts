// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { purgeExpiredContacts } from "./contactRetention";
import type { TournamentStatus } from "../generated/prisma/client";

/**
 * RGPD-001 — preuves contre un vrai PostgreSQL (jamais mocké) de la purge globale planifiée :
 * c'est la clause `where` réelle (frontière de date, statut, filtre des coordonnées) qui porte
 * la conformité, un mock ne prouverait que la forme de l'appel.
 *
 * Isolation : toutes les fixtures sont datées de 1985-1989 et `now` est fixé en 1990 — aucun
 * autre test (tournois datés 2026) ne tombe jamais sous le seuil calculé ici, même quand les
 * fichiers de test s'exécutent en parallèle sur la même base ; les compteurs restent exacts.
 */

// Seuil = NOW - 12 mois = 1989-06-15T00:00:00.000Z (même décalage horaire en juin des deux années).
const NOW = new Date("1990-06-15T00:00:00.000Z");

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function createTournament(date: string, status: TournamentStatus, userId = `org-${randomUUID()}`) {
  const t = await prisma.tournament.create({
    data: {
      userId,
      name: `Tournoi rétention ${date}`,
      date: new Date(`${date}T00:00:00.000Z`),
      location: "Salle test",
      status,
      maxPlayers: 16,
      idempotencyKey: randomUUID(),
    },
  });
  createdTournamentIds.push(t.id);
  return t;
}

async function createRegistration(tournamentId: string, overrides: { email?: string; phone?: string | null } = {}) {
  return prisma.registration.create({
    data: {
      tournamentId,
      playerName: `Joueur ${randomUUID().slice(0, 8)}`,
      playerEmail: overrides.email ?? "joueur@example.com",
      playerPhone: overrides.phone === undefined ? "0612345678" : overrides.phone,
      playerNames: ["Coéquipier A"],
      status: "PAID",
      sterPaymentId: "pay_test",
      entryFeeCents: 500,
      feeCollected: true,
    },
  });
}

function reload(id: string) {
  return prisma.registration.findUniqueOrThrow({ where: { id } });
}

describe("purgeExpiredContacts — purge globale planifiée (RGPD-001, BAPPS-LEGAL-005 §9)", () => {
  it("frontière de date : purge un tournoi daté la veille du seuil, jamais celui daté du jour du seuil (comparaison stricte)", async () => {
    const expired = await createTournament("1989-06-14", "FINISHED");
    const onBoundary = await createTournament("1989-06-15", "FINISHED");
    const rExpired = await createRegistration(expired.id);
    const rBoundary = await createRegistration(onBoundary.id);

    const report = await purgeExpiredContacts({ now: NOW });

    expect(report.cutoff.toISOString()).toBe("1989-06-15T00:00:00.000Z");
    expect(report.registrationsPurged).toBe(1);
    expect(await reload(rExpired.id)).toMatchObject({ playerEmail: "", playerPhone: null });
    expect(await reload(rBoundary.id)).toMatchObject({ playerEmail: "joueur@example.com", playerPhone: "0612345678" });
  });

  it("purge les tournois de tous les organisateurs, y compris ceux qui ne reviennent jamais sur leur tableau de bord", async () => {
    const neverRevisitedA = await createTournament("1987-03-01", "FINISHED", "org-parti-A");
    const neverRevisitedB = await createTournament("1988-11-20", "FINISHED", "org-parti-B");
    const rA = await createRegistration(neverRevisitedA.id);
    const rB = await createRegistration(neverRevisitedB.id, { email: "", phone: "0700000000" });

    const report = await purgeExpiredContacts({ now: NOW });

    expect(report.errors).toBe(0);
    expect(report.registrationsPurged).toBe(2);
    expect(await reload(rA.id)).toMatchObject({ playerEmail: "", playerPhone: null });
    expect(await reload(rB.id)).toMatchObject({ playerEmail: "", playerPhone: null });
  });

  it("laisse intactes les données non concernées : tournoi non FINISHED, nom/pseudo, coéquipiers, paiement", async () => {
    const oldInProgress = await createTournament("1985-01-01", "IN_PROGRESS");
    const oldFinished = await createTournament("1985-01-01", "FINISHED");
    const rInProgress = await createRegistration(oldInProgress.id);
    const rFinished = await createRegistration(oldFinished.id);

    await purgeExpiredContacts({ now: NOW });

    expect(await reload(rInProgress.id)).toEqual(rInProgress);
    const after = await reload(rFinished.id);
    expect(after).toEqual({ ...rFinished, playerEmail: "", playerPhone: null });
    expect(after.playerName).toBe(rFinished.playerName);
    expect(after.playerNames).toEqual(["Coéquipier A"]);
    expect(after).toMatchObject({ sterPaymentId: "pay_test", entryFeeCents: 500, feeCollected: true, status: "PAID" });
  });

  it("est idempotente : un second passage ne trouve et n'écrit plus rien", async () => {
    const t = await createTournament("1988-01-01", "FINISHED");
    await createRegistration(t.id);
    await createRegistration(t.id, { phone: null });

    const first = await purgeExpiredContacts({ now: NOW });
    const second = await purgeExpiredContacts({ now: NOW });

    expect(first.registrationsPurged).toBe(2);
    expect(second.registrationsEligible).toBe(0);
    expect(second.registrationsPurged).toBe(0);
    expect(second.errors).toBe(0);
  });

  it("dry-run : compte les inscriptions à purger sans rien écrire", async () => {
    const t = await createTournament("1988-01-01", "FINISHED");
    const r1 = await createRegistration(t.id);
    const r2 = await createRegistration(t.id, { email: "", phone: "0600000000" });
    const alreadyClean = await createRegistration(t.id, { email: "", phone: null });

    const report = await purgeExpiredContacts({ now: NOW, dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.registrationsEligible).toBe(2);
    expect(report.registrationsPurged).toBe(0);
    expect(await reload(r1.id)).toEqual(r1);
    expect(await reload(r2.id)).toEqual(r2);
    expect(await reload(alreadyClean.id)).toEqual(alreadyClean);
  });

  it("pagine par lots sans en oublier aucun (taille de lot 1, plusieurs tournois)", async () => {
    const ids: string[] = [];
    for (const date of ["1986-01-01", "1986-02-01", "1986-03-01"]) {
      const t = await createTournament(date, "FINISHED");
      ids.push((await createRegistration(t.id)).id);
    }

    const report = await purgeExpiredContacts({ now: NOW, batchSize: 1 });

    expect(report.tournamentsScanned).toBe(3);
    expect(report.batches).toBe(3);
    expect(report.registrationsPurged).toBe(3);
    for (const id of ids) expect(await reload(id)).toMatchObject({ playerEmail: "", playerPhone: null });
  });
});
