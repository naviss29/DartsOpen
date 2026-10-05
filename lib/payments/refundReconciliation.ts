/**
 * F13 (audit du 04/10/2026) — réconciliation planifiée des remboursements restés REFUND_PENDING.
 *
 * Pourquoi : la confirmation d'un remboursement asynchrone n'arrive que par une notification
 * SterPlatform (`payment.refunded` / `payment.refund_failed`). Si elle se perd (retries épuisés,
 * inscription en panne pendant 6 h, notification jamais émise), l'inscription resterait
 * REFUND_PENDING indéfiniment. Ce balayage relit l'état réel de chaque paiement concerné et
 * applique exactement la même règle que le webhook (lib/payments/refundSync.ts).
 *
 * Remboursement jamais demandé (NOT_REQUESTED) : la demande est RELANCÉE (décision du fondateur du
 * 05/10/2026 — DartsOpen ne rembourse que le joueur qui a payé sans obtenir de place, décision
 * déjà prise par le système ; une demande perdue par un incident doit aboutir). Sans risque de
 * double remboursement : SterPlatform rembourse un paiement avec une clé Stripe fixe et répond
 * 409 s'il est déjà remboursé. Un échec CONFIRMÉ (FAILED) n'est jamais relancé : il est signalé à
 * l'organisateur, qui rembourse lui-même depuis son Stripe.
 *
 * Lot borné (`limit`), plus anciennes d'abord ; try/catch par inscription : une erreur n'arrête
 * pas les suivantes.
 */
import { dbListRefundPendingForReconciliation } from "@/lib/db/tournament";
import { syncRegistrationRefund, type RefundDecision, type RefundSyncResult } from "@/lib/payments/refundSync";
import { refundPayment, type RefundOutcome } from "@/lib/api/sterplatformInternal";

export const DEFAULT_REFUND_RECONCILIATION_LIMIT = 100;
export const MAX_REFUND_RECONCILIATION_LIMIT = 1000;
/**
 * Âge minimal d'une inscription REFUND_PENDING avant de la relire : laisse au remboursement
 * synchrone et au webhook normal le temps d'aboutir (la relecture serait sans danger, mais
 * inutile et bruyante sur un remboursement de quelques secondes).
 */
export const DEFAULT_REFUND_MIN_AGE_MINUTES = 60;

export type RefundReconciliationReport = {
  dryRun: boolean;
  cutoff: Date;
  scanned: number;
  confirmed: number;
  failed: number;
  stillPending: number;
  notRequested: number;
  missingPaymentId: number;
  unexpected: number;
  unreadable: number;
  errors: number;
  /** Remboursements jamais demandés pour lesquels la demande a été relancée avec succès. */
  relaunched: number;
};

export type RefundReconciliationOptions = {
  dryRun: boolean;
  limit?: number;
  minAgeMinutes?: number;
  now?: Date;
  log?: (message: string) => void;
  /** Tests uniquement : restreint le balayage (base partagée entre fichiers de test). */
  onlyRegistrationIds?: string[];
  /** Tests uniquement : remplace la synchronisation (frontière SterPlatform). */
  sync?: (registrationId: string, paymentId: string, options: { dryRun: boolean }) => Promise<RefundSyncResult>;
  /** Tests uniquement : remplace la demande de remboursement (frontière SterPlatform). */
  requestRefund?: (paymentId: string) => Promise<RefundOutcome>;
};

export async function reconcilePendingRefunds(options: RefundReconciliationOptions): Promise<RefundReconciliationReport> {
  const limit = options.limit ?? DEFAULT_REFUND_RECONCILIATION_LIMIT;
  const minAgeMinutes = options.minAgeMinutes ?? DEFAULT_REFUND_MIN_AGE_MINUTES;
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.error(message));
  const sync = options.sync ?? ((registrationId, paymentId, o) => syncRegistrationRefund(registrationId, paymentId, o));
  const requestRefund = options.requestRefund ?? refundPayment;
  const cutoff = new Date(now.getTime() - minAgeMinutes * 60 * 1000);

  const report: RefundReconciliationReport = {
    dryRun: options.dryRun,
    cutoff,
    scanned: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
    notRequested: 0,
    missingPaymentId: 0,
    unexpected: 0,
    unreadable: 0,
    errors: 0,
    relaunched: 0,
  };

  const candidates = await dbListRefundPendingForReconciliation(cutoff, limit, options.onlyRegistrationIds);
  const counters: Record<RefundDecision, keyof RefundReconciliationReport> = {
    CONFIRMED: "confirmed",
    FAILED: "failed",
    STILL_PENDING: "stillPending",
    NOT_REQUESTED: "notRequested",
    UNEXPECTED: "unexpected",
    UNREADABLE: "unreadable",
  };

  for (const reg of candidates) {
    report.scanned++;
    if (!reg.sterPaymentId) {
      // Le webhook utilise le paymentId reçu ; la copie locale peut manquer (création du
      // paiement non enregistrée). Sans identifiant, rien à relire : à traiter à la main.
      report.missingPaymentId++;
      log(`[reconcile-refunds] ${reg.id} : aucun identifiant de paiement enregistré, vérification manuelle nécessaire (tournoi ${reg.tournamentId}).`);
      continue;
    }
    try {
      const result = await sync(reg.id, reg.sterPaymentId, { dryRun: options.dryRun });
      const key = counters[result.decision];
      (report[key] as number)++;
      if (result.decision === "NOT_REQUESTED") {
        if (options.dryRun) {
          log(`[reconcile-refunds] ${reg.id} : aucun remboursement demandé chez SterPlatform — serait relancé (dry-run, rien demandé).`);
        } else {
          const outcome = await requestRefund(reg.sterPaymentId);
          if (outcome.outcome === "FAILED") {
            // Réseau, refus ou configuration : rien n'est écrit, le prochain passage réessaie.
            log(`[reconcile-refunds] ${reg.id} : relance du remboursement en échec — ${outcome.error} (nouvel essai au prochain passage).`);
          } else {
            report.relaunched++;
            log(`[reconcile-refunds] ${reg.id} : remboursement relancé (${outcome.outcome}).`);
            // Applique tout de suite l'issue connue (REFUNDED) ; sinon le webhook ou le prochain
            // passage conclura.
            await sync(reg.id, reg.sterPaymentId, { dryRun: false });
          }
        }
      } else if (result.decision !== "STILL_PENDING") {
        log(`[reconcile-refunds] ${reg.id} : ${result.decision}${options.dryRun ? " (dry-run, rien écrit)" : result.changed ? " (écrit)" : " (déjà à jour)"}.`);
      }
    } catch (err) {
      report.errors++;
      log(`[reconcile-refunds] ${reg.id} : erreur — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return report;
}
