import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyTournament = vi.fn();
const updateManyRegistration = vi.fn();
const countRegistration = vi.fn();

vi.mock("./client", () => ({
  prisma: {
    tournament: { findMany: (...args: unknown[]) => findManyTournament(...args) },
    registration: {
      updateMany: (...args: unknown[]) => updateManyRegistration(...args),
      count: (...args: unknown[]) => countRegistration(...args),
    },
  },
}));

import { computeContactRetentionCutoff, purgeExpiredContacts, CONTACT_RETENTION_MONTHS } from "./contactRetention";

beforeEach(() => {
  findManyTournament.mockReset();
  updateManyRegistration.mockReset();
  countRegistration.mockReset();
});

describe("computeContactRetentionCutoff (règle BAPPS-LEGAL-005 §9 inchangée par RGPD-001)", () => {
  it("conserve la durée de 12 mois décidée par le Product Owner", () => {
    expect(CONTACT_RETENTION_MONTHS).toBe(12);
  });

  it(`calcule le seuil à exactement ${CONTACT_RETENTION_MONTHS} mois avant \`now\``, () => {
    expect(computeContactRetentionCutoff(new Date("2026-06-15T12:00:00.000Z")).toISOString()).toBe(
      "2025-06-15T12:00:00.000Z",
    );
  });
});

describe("purgeExpiredContacts — robustesse (RGPD-001)", () => {
  it("un lot en échec est compté et journalisé, les lots suivants sont quand même purgés", async () => {
    findManyTournament
      .mockResolvedValueOnce([{ id: "t1" }])
      .mockResolvedValueOnce([{ id: "t2" }])
      .mockResolvedValueOnce([]);
    updateManyRegistration.mockRejectedValueOnce(new Error("connexion perdue")).mockResolvedValueOnce({ count: 4 });
    const log = vi.fn();

    const report = await purgeExpiredContacts({ now: new Date("2027-01-01T00:00:00.000Z"), batchSize: 1, log });

    expect(report.errors).toBe(1);
    expect(report.registrationsPurged).toBe(4);
    expect(report.batches).toBe(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("connexion perdue"));
    // Pagination par curseur : le second lot reprend strictement après le dernier id du premier.
    expect(findManyTournament.mock.calls[1][0]).toMatchObject({ cursor: { id: "t1" }, skip: 1 });
  });

  it("n'écrit jamais en dry-run et ne met à jour que email/téléphone en mode réel", async () => {
    findManyTournament.mockResolvedValue([{ id: "t1" }]);
    countRegistration.mockResolvedValue(2);
    updateManyRegistration.mockResolvedValue({ count: 2 });

    const dry = await purgeExpiredContacts({ dryRun: true, batchSize: 10 });
    expect(updateManyRegistration).not.toHaveBeenCalled();
    expect(dry).toMatchObject({ registrationsEligible: 2, registrationsPurged: 0 });

    await purgeExpiredContacts({ batchSize: 10 });
    expect(updateManyRegistration.mock.calls[0][0].data).toEqual({ playerEmail: "", playerPhone: null });
  });

  it("refuse une taille de lot invalide plutôt que de boucler indéfiniment", async () => {
    await expect(purgeExpiredContacts({ batchSize: 0 })).rejects.toThrow(/Taille de lot invalide/);
    expect(findManyTournament).not.toHaveBeenCalled();
  });

  it("propage une erreur de lecture de page (le curseur ne peut plus avancer)", async () => {
    findManyTournament.mockRejectedValue(new Error("base indisponible"));
    await expect(purgeExpiredContacts()).rejects.toThrow("base indisponible");
  });
});
