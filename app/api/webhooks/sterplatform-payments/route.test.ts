import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const SECRET = "test-callback-secret";
process.env.STER_PAYMENTS_CALLBACK_SECRET = SECRET;

vi.mock("@/lib/db/tournament", () => ({
  dbConfirmPendingPayment: vi.fn(),
  dbMarkRefundConfirmed: vi.fn(),
  dbGetRegistrationWithTournament: vi.fn(),
}));
vi.mock("@/lib/api/sterplatform", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/api/sterplatformInternal", () => ({
  refundPayment: vi.fn(),
}));

// Import dynamique après avoir posé STER_PAYMENTS_CALLBACK_SECRET : route.ts lit cette variable
// dans une constante de module au chargement, donc un import statique classique l'évaluerait
// avant que la ligne ci-dessus ne s'exécute.
const { POST, verifySignature } = await import("./route");
const { dbConfirmPendingPayment, dbMarkRefundConfirmed, dbGetRegistrationWithTournament } = await import("@/lib/db/tournament");
const { sendEmail } = await import("@/lib/api/sterplatform");
const { refundPayment } = await import("@/lib/api/sterplatformInternal");

type Notification = {
  event: string;
  deliveryId: string;
  paymentId: string;
  externalReference: string;
  organizationSlug: string;
  product: string;
  occurredAt: string;
};

function baseNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    event: "payment.succeeded",
    deliveryId: "delivery-1",
    paymentId: "payment-1",
    externalReference: "registration-1",
    organizationSlug: "dartsopen-club",
    product: "DARTSOPEN",
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildRequest(
  notification: Notification,
  opts: { secret?: string; timestampOffsetSeconds?: number; tamperSignature?: boolean; omitHeader?: boolean } = {}
) {
  const rawBody = JSON.stringify(notification);
  const timestamp = Math.floor(Date.now() / 1000) + (opts.timestampOffsetSeconds ?? 0);
  const signedPayload = `${timestamp}.${notification.deliveryId}.${rawBody}`;
  let signature = createHmac("sha256", opts.secret ?? SECRET).update(signedPayload).digest("hex");
  if (opts.tamperSignature) {
    signature = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
  }
  const headers: Record<string, string> = {};
  if (!opts.omitHeader) {
    headers["x-sterplatform-signature"] = `t=${timestamp},v1=${signature}`;
  }
  return new Request("http://localhost/api/webhooks/sterplatform-payments", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("verifySignature — pure", () => {
  it("accepte une signature valide sur le payload signé complet", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ foo: "bar" });
    const payload = `${timestamp}.delivery-1.${body}`;
    const signature = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifySignature(payload, `t=${timestamp},v1=${signature}`)).toBe(true);
  });

  it("rejette si le payload est altéré après signature (détecte le bug de double préfixage du timestamp)", () => {
    // Si verifySignature reconstruisait `${timestamp}.${payload}` en interne (bug corrigé),
    // ce test échouerait car le payload attendu ne correspondrait plus jamais à la signature.
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ foo: "bar" });
    const payload = `${timestamp}.delivery-1.${body}`;
    const signature = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifySignature(payload + "tampered", `t=${timestamp},v1=${signature}`)).toBe(false);
  });

  it("rejette un timestamp trop ancien (> 5 min)", () => {
    const timestamp = Math.floor(Date.now() / 1000) - 6 * 60;
    const body = JSON.stringify({ foo: "bar" });
    const payload = `${timestamp}.delivery-1.${body}`;
    const signature = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifySignature(payload, `t=${timestamp},v1=${signature}`)).toBe(false);
  });

  it("rejette l'absence d'en-tête", () => {
    expect(verifySignature("anything", null)).toBe(false);
  });
});

describe("POST /api/webhooks/sterplatform-payments", () => {
  beforeEach(() => {
    vi.mocked(dbConfirmPendingPayment).mockReset().mockResolvedValue("CONFIRMED");
    vi.mocked(dbMarkRefundConfirmed).mockReset().mockResolvedValue(undefined);
    vi.mocked(dbGetRegistrationWithTournament).mockReset().mockResolvedValue({
      player_name: "Équipe Test",
      player_email: "test@example.com",
      player_names: ["Alice", "Bob"],
      ster_payment_id: "payment-1",
      tournament_name: "Open Test",
      tournament_date: "1 janvier 2027",
      tournament_location: "Salle Test",
    } as never);
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(refundPayment).mockReset().mockResolvedValue({ outcome: "REFUNDED" });
  });

  it("confirme l'inscription et envoie l'email sur une notification valide (CONFIRMED)", async () => {
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dbConfirmPendingPayment).toHaveBeenCalledWith("registration-1");
    expect(sendEmail).toHaveBeenCalledWith(
      "dartsopen_inscription_confirmation",
      "test@example.com",
      expect.objectContaining({ nom_equipe: "Équipe Test" })
    );
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("rejette une signature invalide sans toucher la base", async () => {
    const req = buildRequest(baseNotification(), { tamperSignature: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbConfirmPendingPayment).not.toHaveBeenCalled();
  });

  it("rejette une notification hors fenêtre de tolérance (replay)", async () => {
    const req = buildRequest(baseNotification(), { timestampOffsetSeconds: -600 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbConfirmPendingPayment).not.toHaveBeenCalled();
  });

  it("rejette un produit différent de DARTSOPEN", async () => {
    const req = buildRequest(baseNotification({ product: "BILLETASSO" }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbConfirmPendingPayment).not.toHaveBeenCalled();
  });

  it("ignore silencieusement un event autre que payment.succeeded (200, aucune écriture)", async () => {
    const req = buildRequest(baseNotification({ event: "payment.failed" }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dbConfirmPendingPayment).not.toHaveBeenCalled();
  });

  it("répond 500 si la confirmation échoue de façon inattendue, sans envoyer d'email", async () => {
    vi.mocked(dbConfirmPendingPayment).mockRejectedValueOnce(new Error("db down"));
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ALREADY_CONFIRMED (redélivraison) : 200, aucun email, aucun remboursement", async () => {
    vi.mocked(dbConfirmPendingPayment).mockResolvedValue("ALREADY_CONFIRMED");
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("NOT_FOUND : 200, aucun email, aucun remboursement", async () => {
    vi.mocked(dbConfirmPendingPayment).mockResolvedValue("NOT_FOUND");
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(refundPayment).not.toHaveBeenCalled();
  });

  describe("REFUND_NEEDED/REFUND_IN_PROGRESS (DARTSOPEN-MONETIZATION-003/004, contre-audit P1) — paiement tardif après reprise de la place", () => {
    it("déclenche une tentative de remboursement via SterPlatform, jamais un email de confirmation", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_NEEDED");
      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(refundPayment).toHaveBeenCalledWith("payment-1");
    });

    it("DARTSOPEN-MONETIZATION-004 (P1, important) : utilise le paymentId reçu par le webhook lui-même, jamais uniquement la copie locale ster_payment_id — fonctionne même si celle-ci est absente en base", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_NEEDED");
      vi.mocked(dbGetRegistrationWithTournament).mockResolvedValue({
        player_name: "Équipe Test",
        player_email: "test@example.com",
        player_names: ["Alice", "Bob"],
        ster_payment_id: null, // absent en base — le webhook ne doit pas en dépendre
        tournament_name: "Open Test",
        tournament_date: "1 janvier 2027",
        tournament_location: "Salle Test",
      } as never);

      const req = buildRequest(baseNotification({ paymentId: "payment-from-webhook" }));
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(refundPayment).toHaveBeenCalledWith("payment-from-webhook");
      // La cible du remboursement ne dépend jamais d'une lecture de la copie locale
      // ster_payment_id — cette lecture n'est même jamais faite sur ce chemin.
      expect(dbGetRegistrationWithTournament).not.toHaveBeenCalled();
    });

    it("REFUNDED (confirmation synchrone) : marque REFUNDED immédiatement, jamais un statut non-2xx", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_NEEDED");
      vi.mocked(refundPayment).mockResolvedValue({ outcome: "REFUNDED" });

      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(dbMarkRefundConfirmed).toHaveBeenCalledWith("registration-1");
    });

    it("ALREADY_REFUNDED (409 déjà remboursé côté SterPlatform) : marque REFUNDED, jamais traité comme un échec", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_IN_PROGRESS");
      vi.mocked(refundPayment).mockResolvedValue({ outcome: "ALREADY_REFUNDED" });

      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(dbMarkRefundConfirmed).toHaveBeenCalledWith("registration-1");
    });

    it("PENDING (remboursement Stripe asynchrone) : 200, mais jamais marqué REFUNDED tant que payment.refunded n'est pas reçu", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_NEEDED");
      vi.mocked(refundPayment).mockResolvedValue({ outcome: "PENDING" });

      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(dbMarkRefundConfirmed).not.toHaveBeenCalled();
    });

    it("SterPlatform indisponible (timeout/réseau) : la tentative de remboursement échoue, réponse non-2xx pour permettre une redélivraison, jamais REFUNDED", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("REFUND_NEEDED");
      vi.mocked(refundPayment).mockResolvedValue({ outcome: "FAILED", error: "Timeout réseau" });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(502);
      expect(dbMarkRefundConfirmed).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Échec"),
        "registration-1",
        "payment-1",
        "Timeout réseau",
      );
      consoleErrorSpy.mockRestore();
    });

    it("DARTSOPEN-MONETIZATION-004 (P1) : retry ultérieur réussi — un premier appel échoué (502) puis une redélivraison réussie confirment REFUNDED, jamais un double remboursement demandé au-delà du nécessaire", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValueOnce("REFUND_NEEDED");
      vi.mocked(refundPayment).mockResolvedValueOnce({ outcome: "FAILED", error: "SterPlatform indisponible" });

      const firstAttempt = await POST(buildRequest(baseNotification()));
      expect(firstAttempt.status).toBe(502);
      expect(dbMarkRefundConfirmed).not.toHaveBeenCalled();

      // Redélivraison du même événement (même deliveryId) — dbConfirmPendingPayment relit l'état
      // réel (REFUND_PENDING désormais) et renvoie REFUND_IN_PROGRESS : c'est le retry.
      vi.mocked(dbConfirmPendingPayment).mockResolvedValueOnce("REFUND_IN_PROGRESS");
      vi.mocked(refundPayment).mockResolvedValueOnce({ outcome: "REFUNDED" });

      const retry = await POST(buildRequest(baseNotification()));
      expect(retry.status).toBe(200);
      expect(dbMarkRefundConfirmed).toHaveBeenCalledWith("registration-1");
      expect(refundPayment).toHaveBeenCalledTimes(2);
    });
  });

  describe("ALREADY_REFUNDED/ALREADY_CONFIRMED (DARTSOPEN-MONETIZATION-004) — webhook répété sans double remboursement", () => {
    it("ALREADY_REFUNDED (déjà confirmé financièrement) : 200, aucune nouvelle tentative de remboursement", async () => {
      vi.mocked(dbConfirmPendingPayment).mockResolvedValue("ALREADY_REFUNDED");
      const req = buildRequest(baseNotification());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(refundPayment).not.toHaveBeenCalled();
      expect(dbMarkRefundConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("payment.refunded — confirmation asynchrone (DARTSOPEN-MONETIZATION-004, contre-audit P1)", () => {
    it("marque le remboursement confirmé pour la registration désignée par externalReference", async () => {
      const req = buildRequest(baseNotification({ event: "payment.refunded", externalReference: "registration-42" }));
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(dbMarkRefundConfirmed).toHaveBeenCalledWith("registration-42");
      expect(dbConfirmPendingPayment).not.toHaveBeenCalled();
    });

    it("idempotent : appelé deux fois (redélivraison), toujours 200, jamais d'erreur", async () => {
      const notif = baseNotification({ event: "payment.refunded", externalReference: "registration-42" });
      const first = await POST(buildRequest(notif));
      const second = await POST(buildRequest(notif));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(dbMarkRefundConfirmed).toHaveBeenCalledTimes(2);
    });
  });
});
