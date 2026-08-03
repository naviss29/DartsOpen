import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const SECRET = "test-callback-secret";
process.env.STER_PAYMENTS_CALLBACK_SECRET = SECRET;

vi.mock("@/lib/db/tournament", () => ({
  dbMarkRegistrationPaid: vi.fn(),
  dbGetRegistrationWithTournament: vi.fn(),
}));
vi.mock("@/lib/api/sterplatform", () => ({
  sendEmail: vi.fn(),
}));

// Import dynamique après avoir posé STER_PAYMENTS_CALLBACK_SECRET : route.ts lit cette variable
// dans une constante de module au chargement, donc un import statique classique l'évaluerait
// avant que la ligne ci-dessus ne s'exécute.
const { POST, verifySignature } = await import("./route");
const { dbMarkRegistrationPaid, dbGetRegistrationWithTournament } = await import("@/lib/db/tournament");
const { sendEmail } = await import("@/lib/api/sterplatform");

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
    vi.mocked(dbMarkRegistrationPaid).mockReset().mockResolvedValue(undefined);
    vi.mocked(dbGetRegistrationWithTournament).mockReset().mockResolvedValue({
      player_name: "Équipe Test",
      player_email: "test@example.com",
      player_names: ["Alice", "Bob"],
      tournament_name: "Open Test",
      tournament_date: "1 janvier 2027",
      tournament_location: "Salle Test",
    } as never);
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined as never);
  });

  it("marque l'inscription payée et envoie l'email sur une notification valide", async () => {
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dbMarkRegistrationPaid).toHaveBeenCalledWith("registration-1");
    expect(sendEmail).toHaveBeenCalledWith(
      "dartsopen_inscription_confirmation",
      "test@example.com",
      expect.objectContaining({ nom_equipe: "Équipe Test" })
    );
  });

  it("rejette une signature invalide sans toucher la base", async () => {
    const req = buildRequest(baseNotification(), { tamperSignature: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbMarkRegistrationPaid).not.toHaveBeenCalled();
  });

  it("rejette une notification hors fenêtre de tolérance (replay)", async () => {
    const req = buildRequest(baseNotification(), { timestampOffsetSeconds: -600 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbMarkRegistrationPaid).not.toHaveBeenCalled();
  });

  it("rejette un produit différent de DARTSOPEN", async () => {
    const req = buildRequest(baseNotification({ product: "BILLETASSO" }));
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(dbMarkRegistrationPaid).not.toHaveBeenCalled();
  });

  it("ignore silencieusement un event autre que payment.succeeded (200, aucune écriture)", async () => {
    const req = buildRequest(baseNotification({ event: "payment.failed" }));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dbMarkRegistrationPaid).not.toHaveBeenCalled();
  });

  it("répond 500 si la mise à jour de la base échoue, sans envoyer d'email", async () => {
    vi.mocked(dbMarkRegistrationPaid).mockRejectedValueOnce(new Error("db down"));
    const req = buildRequest(baseNotification());
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
