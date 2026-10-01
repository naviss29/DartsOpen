// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_API_URL = "https://sterplatform.test";
process.env.STER_API_TOKEN = "module-token";
process.env.NEXT_PUBLIC_APP_URL = "https://dartsopen.test/";

// Import dynamique : lib/api/sterplatformInternal.ts lit API_URL / API_TOKEN dans des constantes
// de module au chargement — l'environnement doit être posé avant.
const {
  createCloseReminderNotifier,
  formatDeletionDateFr,
  formatTournamentDateFr,
  buildTournamentAdminUrl,
  CLOSE_REMINDER_TEMPLATE,
} = await import("./closeReminderNotifier");

/**
 * DO-UNFINISHED-PURGE-001 — contrat avec `POST /api/email/send-to-user` (SterPlatform,
 * EMAIL-SCOPE-001). Seul `fetch` est simulé (frontière externe) : le vrai client
 * `sendEmailToUser` et la vraie traduction statut HTTP → issue sont exercés.
 */

const USER_ID = "0192a4f0-1c2b-7d3e-8f40-123456789abc";
const target = {
  tournamentId: "tournoi-42",
  creatorUserId: USER_ID,
  organizationId: null,
  tournamentName: "Open de Brest",
  tournamentDate: new Date("2026-09-30T00:00:00.000Z"),
  deletionNotBefore: new Date("2026-10-03T04:00:00.000Z"),
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createCloseReminderNotifier — envoi via SterPlatform send-to-user", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("200 {sent:true} → SENT, avec le bon endpoint, le jeton de module et les variables formatées", async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, { sent: true }));

    const result = await createCloseReminderNotifier().send(target);

    expect(result).toEqual({ outcome: "SENT" });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://sterplatform.test/api/email/send-to-user");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "X-App-Token": "module-token", "Content-Type": "application/json" });
    expect(JSON.parse(init!.body as string)).toEqual({
      template: CLOSE_REMINDER_TEMPLATE,
      userId: USER_ID,
      variables: {
        tournamentName: "Open de Brest",
        tournamentDate: "30 septembre 2026",
        deletionDate: "3 octobre 2026 à 06:00",
        tournamentUrl: "https://dartsopen.test/tournaments/tournoi-42",
      },
    });
  });

  it("200 sans confirmation `sent: true` → FAILED (jamais d'horodatage sur une réponse ambiguë)", async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, {}));
    expect((await createCloseReminderNotifier().send(target)).outcome).toBe("FAILED");
  });

  it("404 USER_NOT_FOUND → RECIPIENT_NOT_FOUND", async () => {
    vi.mocked(fetch).mockResolvedValue(json(404, { error: "Utilisateur introuvable.", code: "USER_NOT_FOUND" }));
    expect(await createCloseReminderNotifier().send(target)).toEqual({ outcome: "RECIPIENT_NOT_FOUND" });
  });

  it("404 sans code USER_NOT_FOUND (template non seedé) → CONFIGURATION_ERROR", async () => {
    vi.mocked(fetch).mockResolvedValue(json(404, { error: 'Template "x" introuvable.' }));
    const result = await createCloseReminderNotifier().send(target);
    expect(result.outcome).toBe("CONFIGURATION_ERROR");
  });

  it("500 → FAILED (transitoire)", async () => {
    vi.mocked(fetch).mockResolvedValue(json(500, { error: "Échec lors de l'envoi de l'email." }));
    const result = await createCloseReminderNotifier().send(target);
    expect(result.outcome).toBe("FAILED");
    expect(result.outcome === "FAILED" && result.error).toContain("500");
  });

  it("erreur réseau → FAILED, sans lever", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
    const result = await createCloseReminderNotifier().send(target);
    expect(result.outcome).toBe("FAILED");
    expect(result.outcome === "FAILED" && result.error).toContain("fetch failed");
  });

  it.each([401, 403])("%i → CONFIGURATION_ERROR", async (status) => {
    vi.mocked(fetch).mockResolvedValue(json(status, { error: "Accès refusé." }));
    const result = await createCloseReminderNotifier().send(target);
    expect(result.outcome).toBe("CONFIGURATION_ERROR");
    expect(result.outcome === "CONFIGURATION_ERROR" && result.error).toContain(String(status));
  });

  it("400 → FAILED (corps refusé : pas une panne de configuration globale)", async () => {
    vi.mocked(fetch).mockResolvedValue(json(400, { error: 'Le champ "userId" doit être un UUID valide.' }));
    expect((await createCloseReminderNotifier().send(target)).outcome).toBe("FAILED");
  });

  it("variables d'environnement manquantes → indisponible, CONFIGURATION_ERROR, aucun appel réseau", async () => {
    const notifier = createCloseReminderNotifier({ env: { NEXT_PUBLIC_API_URL: "https://sterplatform.test", STER_API_TOKEN: " " } });
    expect(notifier.available).toBe(false);
    expect(notifier.unavailableReason).toContain("STER_API_TOKEN");
    expect(notifier.unavailableReason).toContain("NEXT_PUBLIC_APP_URL");
    expect((await notifier.send(target)).outcome).toBe("CONFIGURATION_ERROR");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dépendance d'envoi qui lève → FAILED (jamais d'exception vers la purge)", async () => {
    const notifier = createCloseReminderNotifier({
      env: { NEXT_PUBLIC_API_URL: "x", STER_API_TOKEN: "y", NEXT_PUBLIC_APP_URL: "https://a.test" },
      sendToUser: async () => {
        throw new Error("boom");
      },
    });
    const result = await notifier.send(target);
    expect(result.outcome).toBe("FAILED");
  });
});

describe("formatage des variables du rappel", () => {
  it("date du tournoi : date calendaire, jamais décalée par le fuseau ; « 1er » du mois", () => {
    expect(formatTournamentDateFr(new Date("2026-10-01T00:00:00.000Z"))).toBe("1er octobre 2026");
    expect(formatTournamentDateFr(new Date("2026-12-31T00:00:00.000Z"))).toBe("31 décembre 2026");
  });

  it("échéance : heure de Paris (été comme hiver)", () => {
    expect(formatDeletionDateFr(new Date("2026-10-03T04:00:00.000Z"))).toBe("3 octobre 2026 à 06:00");
    expect(formatDeletionDateFr(new Date("2026-12-03T04:00:00.000Z"))).toBe("3 décembre 2026 à 05:00");
    // 23:30 UTC le 30/09 = 01:30 le 1er octobre à Paris.
    expect(formatDeletionDateFr(new Date("2026-09-30T23:30:00.000Z"))).toBe("1er octobre 2026 à 01:30");
  });

  it("URL d'administration : sans double barre oblique, id encodé", () => {
    expect(buildTournamentAdminUrl("https://dartsopen.test//", "a b")).toBe("https://dartsopen.test/tournaments/a%20b");
  });
});

/**
 * ADR-0021 / L7 (D6) — tournoi rattaché : rappel à tous les OWNER/ADMIN de l'organisation via
 * `POST /api/email/send-to-organization` (même contrat que BilletAsso). Seul `fetch` est simulé.
 */
describe("createCloseReminderNotifier — envoi via SterPlatform send-to-organization", () => {
  const ORG_ID = "0192a4f0-1c2b-7d3e-8f40-abcdefabcdef";
  const orgTarget = { ...target, organizationId: ORG_ID };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("200 {sent:true} → SENT, endpoint organisation, UUID de l'organisation (jamais le créateur), mêmes variables", async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, { sent: true, recipientCount: 3 }));

    const result = await createCloseReminderNotifier().send(orgTarget);

    expect(result).toEqual({ outcome: "SENT" });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://sterplatform.test/api/email/send-to-organization");
    expect(init?.headers).toMatchObject({ "X-App-Token": "module-token" });
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      template: CLOSE_REMINDER_TEMPLATE,
      organizationId: ORG_ID,
      variables: {
        tournamentName: "Open de Brest",
        tournamentDate: "30 septembre 2026",
        deletionDate: "3 octobre 2026 à 06:00",
        tournamentUrl: "https://dartsopen.test/tournaments/tournoi-42",
      },
    });
    expect(body).not.toHaveProperty("userId");
  });

  it("200 sans `sent: true` → FAILED", async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, {}));
    expect((await createCloseReminderNotifier().send(orgTarget)).outcome).toBe("FAILED");
  });

  it("404 (organisation ou template introuvable) → FAILED, JAMAIS RECIPIENT_NOT_FOUND (un 404 ne supprime pas)", async () => {
    vi.mocked(fetch).mockResolvedValue(json(404, { error: "Organisation introuvable." }));
    const result = await createCloseReminderNotifier().send(orgTarget);
    expect(result.outcome).toBe("FAILED");
    expect(result.outcome === "FAILED" && result.error).toContain("introuvable");
  });

  it("404 même avec un code USER_NOT_FOUND dans le corps → FAILED (seul send-to-user peut conclure à un destinataire introuvable)", async () => {
    vi.mocked(fetch).mockResolvedValue(json(404, { error: "x", code: "USER_NOT_FOUND" }));
    expect((await createCloseReminderNotifier().send(orgTarget)).outcome).toBe("FAILED");
  });

  it("422 (aucun OWNER/ADMIN actif) → FAILED, jamais une suppression sans rappel", async () => {
    vi.mocked(fetch).mockResolvedValue(json(422, { error: "Aucun destinataire autorisé pour cette organisation." }));
    const result = await createCloseReminderNotifier().send(orgTarget);
    expect(result.outcome).toBe("FAILED");
    expect(result.outcome === "FAILED" && result.error).toContain("administrateur");
  });

  it.each([401, 403])("%i → CONFIGURATION_ERROR", async (status) => {
    vi.mocked(fetch).mockResolvedValue(json(status, { error: "Accès refusé." }));
    expect((await createCloseReminderNotifier().send(orgTarget)).outcome).toBe("CONFIGURATION_ERROR");
  });

  it.each([400, 500])("%i → FAILED", async (status) => {
    vi.mocked(fetch).mockResolvedValue(json(status, { error: "Erreur." }));
    expect((await createCloseReminderNotifier().send(orgTarget)).outcome).toBe("FAILED");
  });

  it("erreur réseau → FAILED, sans lever", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
    const result = await createCloseReminderNotifier().send(orgTarget);
    expect(result.outcome).toBe("FAILED");
    expect(result.outcome === "FAILED" && result.error).toContain("fetch failed");
  });
});
