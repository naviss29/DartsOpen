import { createHmac, timingSafeEqual } from "crypto";
import { dbConfirmPendingPayment, dbMarkRefundConfirmed, dbGetRegistrationWithTournament, type ConfirmPendingPaymentResult } from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";
import { refundPayment } from "@/lib/api/sterplatformInternal";
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

/**
 * DARTSOPEN-MONETIZATION-004 (P1, contre-audit) — tente le remboursement réel et ne confirme
 * REFUNDED que sur une issue financièrement certaine (REFUNDED synchrone, ou ALREADY_REFUNDED —
 * un appel précédent ou le webhook `payment.refunded` a déjà confirmé). PENDING (remboursement
 * Stripe encore asynchrone) n'est jamais un échec : la confirmation arrivera plus tard via
 * `payment.refunded`. Utilise `paymentId` reçu par le webhook lui-même — jamais uniquement la
 * copie locale `ster_payment_id`, qui peut être absente (voir docblock de refundPayment()).
 *
 * Retourne `true` si la situation est résolue ou converge d'elle-même (REFUNDED/ALREADY_REFUNDED/
 * PENDING), `false` uniquement sur un échec réel (réseau, timeout, 5xx, Stripe a refusé) — le
 * seul cas où l'appelant doit répondre un statut non-2xx pour permettre une redélivraison.
 */
async function attemptRefund(registrationId: string, paymentId: string): Promise<boolean> {
  const result = await refundPayment(paymentId);

  if (result.outcome === "REFUNDED" || result.outcome === "ALREADY_REFUNDED") {
    await dbMarkRefundConfirmed(registrationId);
    return true;
  }

  if (result.outcome === "PENDING") {
    console.info("[webhook] Remboursement initié, confirmation asynchrone attendue (payment.refunded):", registrationId, paymentId);
    return true;
  }

  console.error("[webhook] Échec de la tentative de remboursement:", registrationId, paymentId, result.error);
  return false;
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

  if (notification.event === "payment.refunded") {
    // DARTSOPEN-MONETIZATION-004 (P1) — confirmation asynchrone d'un remboursement dont l'appel
    // initial (attemptRefund ci-dessus) avait renvoyé PENDING (certains moyens de paiement
    // Stripe). Idempotent (dbMarkRefundConfirmed ne touche que REFUND_PENDING) — une
    // redélivraison ou un événement reçu deux fois n'a aucun effet la deuxième fois.
    await dbMarkRefundConfirmed(notification.externalReference).catch((err) => {
      console.error("[webhook] Erreur confirmation remboursement:", notification.externalReference, err);
    });
    return NextResponse.json({ received: true });
  }

  if (notification.event === "payment.succeeded") {
    const registrationId = notification.externalReference;

    // DARTSOPEN-MONETIZATION-003/004 (P1, contre-audit) — dbConfirmPendingPayment() est la seule
    // façon dont ce webhook peut faire passer une inscription PENDING → PAID : il relit la
    // réservation ET le tournoi sous verrou, revérifie la capacité (formule correcte) et le
    // statut du tournoi, jamais un simple `UPDATE ... WHERE status = 'PENDING'` aveugle (voir
    // son docblock, lib/db/tournament.ts).
    let result: ConfirmPendingPaymentResult;
    try {
      result = await dbConfirmPendingPayment(registrationId);
    } catch (err) {
      console.error("[webhook] Erreur confirmation paiement:", registrationId, err);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    if (result === "NOT_FOUND" || result === "ALREADY_CONFIRMED" || result === "ALREADY_REFUNDED") {
      // Rien à faire : inscription introuvable/CANCELLED, déjà confirmée, ou déjà remboursée et
      // financièrement close — jamais un second email, jamais une seconde tentative.
      return NextResponse.json({ received: true });
    }

    if (result === "REFUND_NEEDED" || result === "REFUND_IN_PROGRESS") {
      // La réservation n'est plus honorable (capacité reprise, ou tournoi plus dans un état
      // permettant l'inscription) — un remboursement est nécessaire, jamais un paiement
      // silencieusement gardé. `REFUND_IN_PROGRESS` signifie qu'une tentative précédente a déjà
      // échoué : ceci EST le retry (déclenché par une redélivraison du webhook), pas un nouvel
      // état — même chemin de code, idempotent.
      const ok = await attemptRefund(registrationId, notification.paymentId);
      if (!ok) {
        // Statut non-2xx : SterPlatform (Module Payments, file de notifications sortantes)
        // considère la livraison en échec et la retente avec un backoff — ceci EST le
        // mécanisme de retry (aucune infrastructure supplémentaire côté DartsOpen), voir le
        // rapport final pour sa portée opérationnelle réelle.
        return NextResponse.json({ error: "Remboursement non confirmé, nouvelle tentative nécessaire." }, { status: 502 });
      }
      return NextResponse.json({ received: true });
    }

    // result === "CONFIRMED"
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
