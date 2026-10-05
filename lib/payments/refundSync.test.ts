import { describe, it, expect, vi } from "vitest";

// Le module importe la couche base et le client SterPlatform par défaut : on les neutralise, les
// dépendances réelles sont injectées test par test (frontières seulement).
vi.mock("@/lib/db/tournament", () => ({ dbMarkRefundConfirmed: vi.fn(), dbMarkRefundFailed: vi.fn() }));
vi.mock("@/lib/api/sterplatformInternal", () => ({ getPayment: vi.fn() }));

const { decideRefundConvergence, syncRegistrationRefund } = await import("./refundSync");

const payment = (status: string, refundStatus: string | null, externalReference = "reg-1") => ({
  paymentId: "pay-1",
  status,
  refundStatus,
  externalReference,
});

describe("decideRefundConvergence — F13 (règle pure)", () => {
  it.each([
    ["REFUNDED", "SUCCEEDED", "CONFIRMED"],
    ["REFUNDED", null, "CONFIRMED"],
    ["SUCCEEDED", "FAILED", "FAILED"],
    ["SUCCEEDED", "PENDING", "STILL_PENDING"],
    ["SUCCEEDED", "SUCCEEDED", "STILL_PENDING"],
    ["SUCCEEDED", null, "NOT_REQUESTED"],
    ["FAILED", null, "UNEXPECTED"],
    ["PENDING", null, "UNEXPECTED"],
  ])("paiement %s / remboursement %s → %s", (status, refundStatus, expected) => {
    expect(decideRefundConvergence("reg-1", payment(status, refundStatus))).toBe(expected);
  });

  it("paiement illisible → UNREADABLE", () => {
    expect(decideRefundConvergence("reg-1", null)).toBe("UNREADABLE");
  });

  it("paiement d'une autre inscription → UNEXPECTED, jamais appliqué", () => {
    expect(decideRefundConvergence("reg-1", payment("REFUNDED", "SUCCEEDED", "reg-2"))).toBe("UNEXPECTED");
  });

  it("refundStatus absent (SterPlatform antérieur à PAY-003) sur un paiement encore encaissé → NOT_REQUESTED, jamais un échec supposé", () => {
    expect(decideRefundConvergence("reg-1", { paymentId: "pay-1", status: "SUCCEEDED", externalReference: "reg-1" })).toBe("NOT_REQUESTED");
  });
});

describe("syncRegistrationRefund — F13", () => {
  function deps(remote: ReturnType<typeof payment> | null) {
    return {
      getPayment: vi.fn().mockResolvedValue(remote),
      markConfirmed: vi.fn().mockResolvedValue(1),
      markFailed: vi.fn().mockResolvedValue(1),
    };
  }

  it("CONFIRMED : écrit la confirmation, jamais l'échec", async () => {
    const d = deps(payment("REFUNDED", "SUCCEEDED"));
    expect(await syncRegistrationRefund("reg-1", "pay-1", { deps: d })).toEqual({ decision: "CONFIRMED", changed: true });
    expect(d.markConfirmed).toHaveBeenCalledWith("reg-1");
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it("FAILED : écrit l'échec et lève une alerte", async () => {
    const d = deps(payment("SUCCEEDED", "FAILED"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncRegistrationRefund("reg-1", "pay-1", { deps: d })).toEqual({ decision: "FAILED", changed: true });
    expect(d.markFailed).toHaveBeenCalledWith("reg-1");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[ALERTE remboursement]"), "reg-1", "pay-1");
    spy.mockRestore();
  });

  it("dry-run : relit et décide sans rien écrire", async () => {
    const d = deps(payment("REFUNDED", "SUCCEEDED"));
    expect(await syncRegistrationRefund("reg-1", "pay-1", { deps: d, dryRun: true })).toEqual({ decision: "CONFIRMED", changed: false });
    expect(d.markConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    [payment("SUCCEEDED", "PENDING"), "STILL_PENDING"],
    [payment("SUCCEEDED", null), "NOT_REQUESTED"],
    [null, "UNREADABLE"],
  ] as const)("%o → %s : aucune écriture", async (remote, decision) => {
    const d = deps(remote);
    expect(await syncRegistrationRefund("reg-1", "pay-1", { deps: d })).toEqual({ decision, changed: false });
    expect(d.markConfirmed).not.toHaveBeenCalled();
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it("erreur base : remonte à l'appelant (le webhook répondra non-2xx)", async () => {
    const d = deps(payment("REFUNDED", "SUCCEEDED"));
    d.markConfirmed.mockRejectedValue(new Error("db down"));
    await expect(syncRegistrationRefund("reg-1", "pay-1", { deps: d })).rejects.toThrow("db down");
  });
});
