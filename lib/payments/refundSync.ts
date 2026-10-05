/**
 * F13 (audit du 04/10/2026) — fait converger l'état local d'un remboursement d'inscription vers
 * l'état RÉEL du paiement chez SterPlatform. Un seul point de décision, partagé par le webhook
 * (`payment.refunded` / `payment.refund_failed`) et par la réconciliation planifiée
 * (`scripts/reconcile-refunds.ts`).
 *
 * Pourquoi relire au lieu de croire l'événement reçu : contrat SterPlatform (le payload est
 * minimal, la BApp relit `GET /api/internal/payments/{id}` avant d'agir). Les notifications
 * peuvent arriver dans le désordre ou être redélivrées tard (un vieux `payment.refunded` après un
 * `payment.refund_failed`, ou l'inverse) : seule la relecture dit la vérité du moment, et rend le
 * traitement indifférent à l'ordre et aux doublons.
 *
 * Ne relance JAMAIS un remboursement : un échec confirmé est signalé (état + alerte), la suite
 * est une décision humaine de l'organisateur.
 */
import { getPayment, type PaymentRecord } from "@/lib/api/sterplatformInternal";
import { dbMarkRefundConfirmed, dbMarkRefundFailed } from "@/lib/db/tournament";

export type RefundDecision =
  /** Paiement REFUNDED chez SterPlatform : remboursement confirmé. */
  | "CONFIRMED"
  /** Paiement SUCCEEDED + refundStatus FAILED : l'argent n'a pas été rendu. */
  | "FAILED"
  /** Remboursement demandé, issue pas encore connue (refundStatus PENDING/SUCCEEDED sans REFUNDED). */
  | "STILL_PENDING"
  /** Paiement encaissé sans remboursement demandé : la demande initiale n'a jamais abouti. */
  | "NOT_REQUESTED"
  /** Réponse incohérente (autre référence, statut inattendu) : on n'écrit rien. */
  | "UNEXPECTED"
  /** SterPlatform illisible (réseau, 404, 5xx) : on n'écrit rien, on réessaiera. */
  | "UNREADABLE";

/** Règle pure — testée isolément. */
export function decideRefundConvergence(registrationId: string, remote: PaymentRecord | null): RefundDecision {
  if (!remote) return "UNREADABLE";
  // Défense en profondeur : ne jamais appliquer l'état d'un paiement qui n'est pas celui de
  // cette inscription (paymentId mal recopié, événement mal routé).
  if (remote.externalReference !== registrationId) return "UNEXPECTED";
  if (remote.status === "REFUNDED") return "CONFIRMED";
  if (remote.status === "SUCCEEDED") {
    if (remote.refundStatus === "FAILED") return "FAILED";
    if (remote.refundStatus === "PENDING" || remote.refundStatus === "SUCCEEDED") return "STILL_PENDING";
    return "NOT_REQUESTED";
  }
  return "UNEXPECTED";
}

export type RefundSyncResult = { decision: RefundDecision; changed: boolean };

export type RefundSyncDeps = {
  getPayment: (paymentId: string) => Promise<PaymentRecord | null>;
  markConfirmed: (registrationId: string) => Promise<number>;
  markFailed: (registrationId: string) => Promise<number>;
};

const defaultDeps: RefundSyncDeps = {
  getPayment,
  markConfirmed: dbMarkRefundConfirmed,
  markFailed: (registrationId) => dbMarkRefundFailed(registrationId),
};

/**
 * Relit le paiement, décide, écrit (écritures conditionnelles idempotentes). Les erreurs de
 * base REMONTENT : l'appelant (webhook) doit alors répondre non-2xx pour que SterPlatform
 * redélivre — jamais acquitter une écriture qui n'a pas eu lieu.
 *
 * `dryRun` : relit et décide sans rien écrire (réconciliation --dry-run).
 */
export async function syncRegistrationRefund(
  registrationId: string,
  paymentId: string,
  options: { dryRun?: boolean; deps?: RefundSyncDeps } = {},
): Promise<RefundSyncResult> {
  const deps = options.deps ?? defaultDeps;
  const remote = await deps.getPayment(paymentId);
  const decision = decideRefundConvergence(registrationId, remote);

  if (options.dryRun) return { decision, changed: false };

  if (decision === "CONFIRMED") {
    const count = await deps.markConfirmed(registrationId);
    return { decision, changed: count > 0 };
  }

  if (decision === "FAILED") {
    const count = await deps.markFailed(registrationId);
    if (count > 0) {
      // Alerte d'exploitation : préfixe stable, cherchable dans les journaux Coolify. Jamais de
      // nom ni d'email (données personnelles) — les identifiants suffisent à retrouver le cas.
      console.error(
        "[ALERTE remboursement] Échec du remboursement confirmé par SterPlatform — l'argent n'a pas été rendu, " +
          "décision de l'organisateur nécessaire (aucune relance automatique) :",
        registrationId,
        paymentId,
      );
    }
    return { decision, changed: count > 0 };
  }

  if (decision === "UNEXPECTED") {
    console.warn(
      "[refund-sync] État de paiement inattendu, rien n'est écrit :",
      registrationId,
      paymentId,
      remote?.status,
      remote?.refundStatus ?? null,
    );
  }
  return { decision, changed: false };
}
