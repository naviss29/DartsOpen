// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  classifyUnfinishedTournament,
  deletionNotBefore,
  startOfUtcDay,
  purgeUnfinishedTournaments,
} from "./unfinishedTournamentPurge";
import { createCloseReminderNotifier } from "../tournament/closeReminderNotifier";

/**
 * DO-UNFINISHED-PURGE-001 — règle pure (sans base) : c'est elle qui décide rappel/attente/
 * suppression, partagée par le balayage et les deux revérifications sous verrou. Les preuves
 * contre un vrai PostgreSQL sont dans unfinishedTournamentPurge.db.test.ts.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const H = 60 * 60 * 1000;

describe("startOfUtcDay", () => {
  it("ramène à minuit UTC du même jour", () => {
    expect(startOfUtcDay(new Date("2026-09-30T23:59:59.999Z")).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("classifyUnfinishedTournament", () => {
  const now = new Date("2026-10-02T04:00:00.000Z");

  it("ne fait rien pour un tournoi FINISHED, même très ancien et déjà rappelé", () => {
    expect(
      classifyUnfinishedTournament({ status: "FINISHED", date: day("2026-01-01"), closeReminderSentAt: day("2026-01-02") }, now),
    ).toBe("NOT_DUE");
  });

  it("aucun rappel le jour même du tournoi (avant J+1 00:00 UTC)", () => {
    expect(classifyUnfinishedTournament({ status: "IN_PROGRESS", date: day("2026-10-02"), closeReminderSentAt: null }, now)).toBe("NOT_DUE");
    expect(classifyUnfinishedTournament({ status: "OPEN", date: day("2026-10-05"), closeReminderSentAt: null }, now)).toBe("NOT_DUE");
  });

  it("rappel dû à partir de J+1, pour tout statut non terminal", () => {
    for (const status of ["PENDING_ENTITLEMENT", "DRAFT", "OPEN", "IN_PROGRESS"] as const) {
      expect(classifyUnfinishedTournament({ status, date: day("2026-10-01"), closeReminderSentAt: null }, now)).toBe("SEND_REMINDER");
    }
  });

  it("attend 48 h pleines après le rappel, supprime ensuite", () => {
    const sentAt = new Date("2026-10-02T04:00:00.000Z");
    const t = { status: "OPEN" as const, date: day("2026-10-01"), closeReminderSentAt: sentAt };
    expect(classifyUnfinishedTournament(t, new Date(sentAt.getTime() + 48 * H - 1))).toBe("AWAITING_GRACE");
    expect(classifyUnfinishedTournament(t, new Date(sentAt.getTime() + 48 * H))).toBe("DELETE");
  });

  it("un rappel antérieur à la date courante (tournoi reporté) ne vaut pas avertissement : nouveau rappel, jamais suppression", () => {
    // Rappel envoyé le 02/10 pour la date initiale du 01/10, puis tournoi reporté au 10/10.
    const t = { status: "OPEN" as const, date: day("2026-10-10"), closeReminderSentAt: new Date("2026-10-02T04:00:00.000Z") };
    expect(classifyUnfinishedTournament(t, new Date("2026-10-05T04:00:00.000Z"))).toBe("NOT_DUE");
    expect(classifyUnfinishedTournament(t, new Date("2026-10-11T04:00:00.000Z"))).toBe("SEND_REMINDER");
  });
});

describe("deletionNotBefore", () => {
  it("vaut rappel + 48 h", () => {
    expect(deletionNotBefore(new Date("2026-10-02T04:00:00.000Z")).toISOString()).toBe("2026-10-04T04:00:00.000Z");
  });
});

describe("purgeUnfinishedTournaments — validation", () => {
  it("refuse une taille de lot invalide avant toute requête", async () => {
    await expect(
      purgeUnfinishedTournaments({ notifier: createCloseReminderNotifier(), batchSize: 0 }),
    ).rejects.toThrow(/Taille de lot invalide/);
  });
});

describe("createCloseReminderNotifier (état actuel : bloqué côté SterPlatform)", () => {
  it("se déclare indisponible et lève à l'envoi — donc jamais d'horodatage ni de suppression", async () => {
    const notifier = createCloseReminderNotifier();
    expect(notifier.available).toBe(false);
    await expect(
      notifier.send({
        tournamentId: "t",
        creatorUserId: "u",
        tournamentName: "n",
        tournamentDate: day("2026-10-01"),
        deletionNotBefore: day("2026-10-04"),
      }),
    ).rejects.toThrow(/Rappel de clôture impossible/);
  });
});
