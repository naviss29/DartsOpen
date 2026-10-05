/**
 * F13 (audit du 04/10/2026) — réconciliation planifiée des remboursements restés REFUND_PENDING.
 *
 * Pourquoi : la confirmation d'un remboursement asynchrone n'arrive que par une notification
 * SterPlatform (`payment.refunded` / `payment.refund_failed`). Si elle se perd (retries épuisés,
 * inscription en panne pendant 6 h, notification jamais émise), l'inscription resterait
 * REFUND_PENDING indéfiniment. Ce balayage relit l'état réel de chaque paiement concerné et
 * applique exactement la même règle que le webhook (lib/payments/refundSync.ts).
 *
 * Ce qu'il ne fait JAMAIS : demander un remboursement. Un échec confirmé est signalé ; un
 * remboursement jamais demandé (NOT_REQUESTED) est seulement compté et journalisé — la relance
 * est une décision humaine (voir CLAUDE.md, points ouverts).
 *
 * Lot borné (`limit`), plus anciennes d'abord ; try/catch par inscription : une erreur n'arrête
 * pas les suivantes.
 */
import { dbListRefundPendingForReconciliation } from "@/lib/db/tournament";
import { syncRegistrationRefund, type RefundDecision, type RefundSyncResult } from "@/lib/payments/refundSync";

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
};

export async function reconcilePendingRefunds(options: RefundReconciliationOptions): Promise<RefundReconciliationReport> {
  const limit = options.limit ?? DEFAULT_REFUND_RECONCILIATION_LIMIT;
  const minAgeMinutes = options.minAgeMinutes ?? DEFAULT_REFUND_MIN_AGE_MINUTES;
  const now = options.now ?? new Date();
  const log = options.log ?? ((message: string) => console.error(message));
  const sync = options.sync ?? ((registrationId, paymentId, o) => syncRegistrationRefund(registrationId, paymentId, o));
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
        log(`[reconcile-refunds] ${reg.id} : paiement encaissé mais aucun remboursement demandé chez SterPlatform — décision humaine requise (aucune relance automatique).`);
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
