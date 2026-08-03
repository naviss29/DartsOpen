import { createHmac, timingSafeEqual } from "crypto";
import { dbMarkRegistrationPaid, dbGetRegistrationWithTournament } from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";
import { NextResponse } from "next/server";

const SECRET = process.env.STER_PAYMENTS_CALLBACK_SECRET ?? "";
// Fenêtre de tolérance identique à la pratique Stripe elle-même (que ce mécanisme imite,
// cf. OutboundWebhookNotifier côté SterPlatform) — rejette une livraison rejouée trop tard.
const TOLERANCE_SECONDS = 5 * 60;

type PaymentNotification = {
  event: string;
  deliveryId: string;
  paymentId: string;
  externalReference: string;
  organizationSlug: string;
  product: string;
  occurredAt: string;
};

// `payload` doit déjà être la chaîne signée complète `timestamp.deliveryId.body`
// (cf. OutboundWebhookNotifier côté SterPlatform) — cette fonction ne la reconstruit pas.
export function verifySignature(payload: string, header: string | null): boolean {
  if (!header || !SECRET) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", SECRET).update(payload).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const header = req.headers.get("x-sterplatform-signature");

  let notification: PaymentNotification;
  try {
    notification = JSON.parse(rawBody) as PaymentNotification;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const timestamp = header?.split(",").find((p) => p.startsWith("t="))?.slice(2);
  const signedPayload = timestamp ? `${timestamp}.${notification.deliveryId}.${rawBody}` : rawBody;
  if (!verifySignature(signedPayload, header)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (notification.product !== "DARTSOPEN") {
    return NextResponse.json({ error: "Produit inattendu." }, { status: 400 });
  }

  if (notification.event === "payment.succeeded") {
    const registrationId = notification.externalReference;

    // Laisser remonter l'erreur DB : SterPlatform ne retente pas (v1, delivery unique) mais
    // GET /api/internal/payments/{id} reste la source de vérité si cette écriture échoue.
    try {
      await dbMarkRegistrationPaid(registrationId);
    } catch (err) {
      console.error("[webhook] Erreur mise à jour registration:", registrationId, err);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    const reg = await dbGetRegistrationWithTournament(registrationId).catch((err) => {
      console.warn("[webhook] Impossible de récupérer la registration pour l'email:", registrationId, err);
      return null;
    });
    if (reg) {
      await sendEmail('dartsopen_inscription_confirmation', reg.player_email, {
        nom_equipe: reg.player_name,
        tournoi: reg.tournament_name,
        date: reg.tournament_date,
        lieu: reg.tournament_location,
        joueurs: reg.player_names.join(', '),
      }).catch((err) => console.error('[webhook] Erreur envoi email confirmation:', reg.player_email, err));
    }
  }

  return NextResponse.json({ received: true });
}
