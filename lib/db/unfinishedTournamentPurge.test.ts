// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  classifyUnfinishedTournament,
  deletionNotBefore,
  deletionWithoutReminderNotBefore,
  needsCloseReminder,
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

describe("classifyUnfinishedTournament — créateur introuvable (404 USER_NOT_FOUND)", () => {
  // Tournoi du 01/10 : J+1 = 02/10 00:00 UTC, échéance sans rappel = 04/10 00:00 UTC.
  const date = day("2026-10-01");
  const notFoundAt = new Date("2026-10-02T04:00:00.000Z");

  it("avant J+1 + 48 h : le rappel reste simplement à retenter", () => {
    const t = { status: "OPEN" as const, date, closeReminderSentAt: null, closeReminderRecipientNotFoundAt: notFoundAt };
    expect(classifyUnfinishedTournament(t, new Date("2026-10-03T23:59:59.999Z"))).toBe("SEND_REMINDER");
  });

  it("à partir de J+1 00:00 UTC + 48 h (pas du constat) : suppression sans rappel si le 404 est reconfirmé", () => {
    const t = { status: "IN_PROGRESS" as const, date, closeReminderSentAt: null, closeReminderRecipientNotFoundAt: notFoundAt };
    expect(classifyUnfinishedTournament(t, new Date("2026-10-04T00:00:00.000Z"))).toBe("DELETE_IF_RECIPIENT_STILL_NOT_FOUND");
    expect(deletionWithoutReminderNotBefore(date).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("sans constat de 404, l'échéance ne change rien : jamais de suppression sans rappel", () => {
    const t = { status: "OPEN" as const, date, closeReminderSentAt: null, closeReminderRecipientNotFoundAt: null };
    expect(classifyUnfinishedTournament(t, new Date("2026-10-20T04:00:00.000Z"))).toBe("SEND_REMINDER");
    expect(classifyUnfinishedTournament({ status: "OPEN", date, closeReminderSentAt: null }, new Date("2026-10-20T04:00:00.000Z"))).toBe("SEND_REMINDER");
  });

  it("un rappel finalement envoyé prime : ses 48 h s'appliquent", () => {
    const sentAt = new Date("2026-10-04T04:00:00.000Z");
    const t = { status: "OPEN" as const, date, closeReminderSentAt: sentAt, closeReminderRecipientNotFoundAt: notFoundAt };
    expect(classifyUnfinishedTournament(t, new Date("2026-10-05T04:00:00.000Z"))).toBe("AWAITING_GRACE");
    expect(classifyUnfinishedTournament(t, new Date("2026-10-06T04:00:00.000Z"))).toBe("DELETE");
  });

  it("tournoi FINISHED ou reporté : le constat ne vaut plus rien", () => {
    const now = new Date("2026-10-10T04:00:00.000Z");
    expect(
      classifyUnfinishedTournament({ status: "FINISHED", date, closeReminderSentAt: null, closeReminderRecipientNotFoundAt: notFoundAt }, now),
    ).toBe("NOT_DUE");
    // Reporté au 08/10 : constat du 02/10 antérieur à la nouvelle J+1 ⇒ cycle neuf (rappel).
    const postponed = { status: "OPEN" as const, date: day("2026-10-08"), closeReminderSentAt: null, closeReminderRecipientNotFoundAt: notFoundAt };
    expect(classifyUnfinishedTournament(postponed, new Date("2026-10-07T04:00:00.000Z"))).toBe("NOT_DUE");
    expect(classifyUnfinishedTournament(postponed, new Date("2026-10-12T04:00:00.000Z"))).toBe("SEND_REMINDER");
  });

  it("needsCloseReminder : vrai pour les deux actions qui passent par un nouvel essai d'envoi", () => {
    expect(needsCloseReminder("SEND_REMINDER")).toBe(true);
    expect(needsCloseReminder("DELETE_IF_RECIPIENT_STILL_NOT_FOUND")).toBe(true);
    expect(needsCloseReminder("DELETE")).toBe(false);
    expect(needsCloseReminder("AWAITING_GRACE")).toBe(false);
    expect(needsCloseReminder("NOT_DUE")).toBe(false);
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

describe("createCloseReminderNotifier (configuration absente)", () => {
  it("se déclare indisponible et renvoie CONFIGURATION_ERROR — donc jamais d'horodatage ni de suppression", async () => {
    const notifier = createCloseReminderNotifier({ env: {} });
    expect(notifier.available).toBe(false);
    const result = await notifier.send({
      tournamentId: "t",
      creatorUserId: "u",
      organizationId: null,
      tournamentName: "n",
      tournamentDate: day("2026-10-01"),
      deletionNotBefore: day("2026-10-04"),
    });
    expect(result.outcome).toBe("CONFIGURATION_ERROR");
  });
});
