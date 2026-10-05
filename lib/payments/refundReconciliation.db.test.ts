// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import {
  dbCreateTournament,
  dbConfirmPendingPayment,
  dbMarkRefundConfirmed,
  dbMarkRefundFailed,
  dbListUnresolvedRefunds,
} from "@/lib/db/tournament";
import type { PaymentRecord } from "@/lib/api/sterplatformInternal";
import { syncRegistrationRefund } from "./refundSync";
import { reconcilePendingRefunds } from "./refundReconciliation";
import type { RegistrationStatus } from "@/lib/generated/prisma/client";

/**
 * F13 (audit du 04/10/2026) — preuves contre un vrai PostgreSQL : écritures conditionnelles
 * (idempotence, ordre inversé, jamais de retour à PAID) et réconciliation par lots. Seule la
 * relecture SterPlatform (frontière) est simulée.
 *
 * Isolation (base partagée, fichiers en parallèle) : la réconciliation est restreinte aux
 * inscriptions créées ici (`onlyRegistrationIds`).
 */

const createdTournamentIds: string[] = [];

afterEach(async () => {
  if (createdTournamentIds.length > 0) {
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    createdTournamentIds.length = 0;
  }
});

async function createTournament() {
  const t = await dbCreateTournament(
    "user-refund-f13",
    {
      name: "Tournoi remboursement",
      date: "2026-09-01",
      location: "Salle",
      max_players: 16,
      entry_fee: 10,
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
  return t.id;
}

async function createRegistration(
  tournamentId: string,
  data: { status: RegistrationStatus; sterPaymentId?: string | null; createdAt?: Date; refundFailedAt?: Date | null },
) {
  return prisma.registration.create({
    data: {
      tournamentId,
      playerName: "Joueur F13",
      playerEmail: "f13@example.test",
      playerNames: ["Joueur F13"],
      status: data.status,
      sterPaymentId: data.sterPaymentId === undefined ? `pay-${randomUUID()}` : data.sterPaymentId,
      createdAt: data.createdAt,
      refundFailedAt: data.refundFailedAt ?? null,
    },
  });
}

const row = (id: string) => prisma.registration.findUniqueOrThrow({ where: { id } });

describe("dbMarkRefundFailed / dbMarkRefundConfirmed — écritures conditionnelles (F13)", () => {
  it("REFUND_PENDING → échec visible ; un doublon ne change rien (premier horodatage conservé)", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUND_PENDING" });
    const first = new Date("2026-10-01T10:00:00.000Z");

    expect(await dbMarkRefundFailed(reg.id, first)).toBe(1);
    expect(await dbMarkRefundFailed(reg.id, new Date("2026-10-02T10:00:00.000Z"))).toBe(0);

    const r = await row(reg.id);
    expect(r.status).toBe("REFUND_PENDING");
    expect(r.refundFailedAt?.toISOString()).toBe(first.toISOString());
    expect(await dbListUnresolvedRefunds(t)).toEqual([
      expect.objectContaining({ id: reg.id, refund_failed_at: first.toISOString() }),
    ]);
  });

  it("ordre inversé : échec puis confirmation → REFUNDED, échec effacé ; confirmation rejouée sans effet", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUND_PENDING" });

    await dbMarkRefundFailed(reg.id);
    expect(await dbMarkRefundConfirmed(reg.id)).toBe(1);
    expect(await dbMarkRefundConfirmed(reg.id)).toBe(0);

    const r = await row(reg.id);
    expect(r.status).toBe("REFUNDED");
    expect(r.refundFailedAt).toBeNull();
  });

  it("remboursement d'abord réussi puis échoué (PAY-003) : REFUNDED → REFUND_PENDING en échec, jamais PAID", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUNDED" });

    expect(await dbMarkRefundFailed(reg.id)).toBe(1);
    const r = await row(reg.id);
    expect(r.status).toBe("REFUND_PENDING");
    expect(r.refundFailedAt).not.toBeNull();
  });

  it.each(["PAID", "PENDING", "CANCELLED"] as const)("%s : un échec de remboursement non décidé par DartsOpen ne touche pas l'inscription", async (status) => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status });

    expect(await dbMarkRefundFailed(reg.id)).toBe(0);
    expect(await dbMarkRefundConfirmed(reg.id)).toBe(0);
    const r = await row(reg.id);
    expect(r.status).toBe(status);
    expect(r.refundFailedAt).toBeNull();
  });

  it("payment.succeeded redélivré sur un remboursement en échec → REFUND_FAILED (aucune relance automatique)", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUND_PENDING", refundFailedAt: new Date() });
    expect(await dbConfirmPendingPayment(reg.id)).toBe("REFUND_FAILED");
  });
});

describe("syncRegistrationRefund sur vraie base — doublons et ordre (F13)", () => {
  function remote(registrationId: string, status: string, refundStatus: string | null): PaymentRecord {
    return { paymentId: "pay", status, refundStatus, externalReference: registrationId };
  }

  it("refund_failed ×2 puis refunded : état final REFUNDED, une seule alerte", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUND_PENDING" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failedDeps = {
      getPayment: async () => remote(reg.id, "SUCCEEDED", "FAILED"),
      markConfirmed: dbMarkRefundConfirmed,
      markFailed: (id: string) => dbMarkRefundFailed(id),
    };

    expect((await syncRegistrationRefund(reg.id, "pay", { deps: failedDeps })).changed).toBe(true);
    expect((await syncRegistrationRefund(reg.id, "pay", { deps: failedDeps })).changed).toBe(false);
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("[ALERTE remboursement]"))).toHaveLength(1);

    const ok = await syncRegistrationRefund(reg.id, "pay", {
      deps: { ...failedDeps, getPayment: async () => remote(reg.id, "REFUNDED", "SUCCEEDED") },
    });
    expect(ok).toEqual({ decision: "CONFIRMED", changed: true });
    expect((await row(reg.id)).status).toBe("REFUNDED");
    spy.mockRestore();
  });
});

describe("reconcilePendingRefunds — réconciliation par lots (F13)", () => {
  const OLD = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 h : au-delà du seuil par défaut (60 min)

  function fakeSync(remotes: Record<string, PaymentRecord | null>) {
    return vi.fn((registrationId: string, paymentId: string, options: { dryRun: boolean }) =>
      syncRegistrationRefund(registrationId, paymentId, {
        dryRun: options.dryRun,
        deps: {
          getPayment: async () => remotes[registrationId] ?? null,
          markConfirmed: dbMarkRefundConfirmed,
          markFailed: (id) => dbMarkRefundFailed(id),
        },
      }),
    );
  }

  it("fait converger chaque cas, ignore les récentes et les échecs déjà constatés, n'écrit rien en dry-run", async () => {
    const t = await createTournament();
    const refunded = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const failed = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const pending = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const neverRequested = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const noPaymentId = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD, sterPaymentId: null });
    const unreadable = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const recent = await createRegistration(t, { status: "REFUND_PENDING" });
    const alreadyFailed = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD, refundFailedAt: OLD });
    const ids = [refunded, failed, pending, neverRequested, noPaymentId, unreadable, recent, alreadyFailed].map((r) => r.id);

    const sync = fakeSync({
      [refunded.id]: { paymentId: "p", status: "REFUNDED", refundStatus: "SUCCEEDED", externalReference: refunded.id },
      [failed.id]: { paymentId: "p", status: "SUCCEEDED", refundStatus: "FAILED", externalReference: failed.id },
      [pending.id]: { paymentId: "p", status: "SUCCEEDED", refundStatus: "PENDING", externalReference: pending.id },
      [neverRequested.id]: { paymentId: "p", status: "SUCCEEDED", refundStatus: null, externalReference: neverRequested.id },
      [unreadable.id]: null,
    });
    const logs: string[] = [];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Remboursement jamais demandé : relancé (décision du 05/10/2026), jamais en dry-run.
    const requestRefund = vi.fn(async () => ({ outcome: "PENDING" as const }));
    const dry = await reconcilePendingRefunds({ dryRun: true, onlyRegistrationIds: ids, sync, requestRefund, log: (m) => logs.push(m) });
    expect(requestRefund).not.toHaveBeenCalled();
    expect(dry).toMatchObject({ scanned: 6, confirmed: 1, failed: 1, stillPending: 1, notRequested: 1, missingPaymentId: 1, unreadable: 1, errors: 0 });
    expect((await row(refunded.id)).status).toBe("REFUND_PENDING");
    expect((await row(failed.id)).refundFailedAt).toBeNull();

    const applied = await reconcilePendingRefunds({ dryRun: false, onlyRegistrationIds: ids, sync, requestRefund, log: (m) => logs.push(m) });
    expect(requestRefund).toHaveBeenCalledTimes(1);
    expect(applied.relaunched).toBe(1);
    expect(applied).toMatchObject({ scanned: 6, confirmed: 1, failed: 1, stillPending: 1, notRequested: 1, missingPaymentId: 1, unreadable: 1, errors: 0 });
    expect((await row(refunded.id)).status).toBe("REFUNDED");
    expect((await row(failed.id)).refundFailedAt).not.toBeNull();
    expect((await row(pending.id)).status).toBe("REFUND_PENDING");
    expect((await row(neverRequested.id)).status).toBe("REFUND_PENDING");
    expect(sync).not.toHaveBeenCalledWith(recent.id, expect.anything(), expect.anything());
    expect(sync).not.toHaveBeenCalledWith(alreadyFailed.id, expect.anything(), expect.anything());
    expect(logs.some((m) => m.includes(neverRequested.id) && m.includes("remboursement relancé"))).toBe(true);

    // Rejouer : les cas résolus sortent du balayage (idempotent).
    const again = await reconcilePendingRefunds({ dryRun: false, onlyRegistrationIds: ids, sync, requestRefund, log: () => {} });
    expect(again).toMatchObject({ scanned: 4, confirmed: 0, failed: 0 });
    errSpy.mockRestore();
  });

  it("lot borné : jamais plus de `limit` inscriptions, les plus anciennes d'abord ; une erreur n'arrête pas les suivantes", async () => {
    const t = await createTournament();
    const oldest = await createRegistration(t, { status: "REFUND_PENDING", createdAt: new Date(OLD.getTime() - 60_000) });
    const middle = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const newest = await createRegistration(t, { status: "REFUND_PENDING", createdAt: new Date(OLD.getTime() + 60_000) });
    const ids = [oldest.id, middle.id, newest.id];

    const sync = vi.fn(async (registrationId: string) => {
      if (registrationId === oldest.id) throw new Error("base indisponible");
      return { decision: "STILL_PENDING" as const, changed: false };
    });

    const report = await reconcilePendingRefunds({ dryRun: false, limit: 2, onlyRegistrationIds: ids, sync, log: () => {} });
    expect(report).toMatchObject({ scanned: 2, errors: 1, stillPending: 1 });
    expect(sync.mock.calls.map((c) => c[0])).toEqual([oldest.id, middle.id]);
  });

  it("relance en échec (réseau, refus) : rien n'est écrit, aucun compteur de relance, nouvel essai au passage suivant", async () => {
    const t = await createTournament();
    const reg = await createRegistration(t, { status: "REFUND_PENDING", createdAt: OLD });
    const sync = fakeSync({ [reg.id]: { paymentId: "p", status: "SUCCEEDED", refundStatus: null, externalReference: reg.id } });
    const requestRefund = vi.fn(async () => ({ outcome: "FAILED" as const, error: "réseau" }));

    const report = await reconcilePendingRefunds({ dryRun: false, onlyRegistrationIds: [reg.id], sync, requestRefund, log: () => {} });
    expect(report).toMatchObject({ notRequested: 1, relaunched: 0, errors: 0 });
    expect((await row(reg.id)).status).toBe("REFUND_PENDING");
    expect((await row(reg.id)).refundFailedAt).toBeNull();
  });
});
