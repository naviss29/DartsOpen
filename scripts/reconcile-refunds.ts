#!/usr/bin/env tsx
/**
 * F13 (audit du 04/10/2026) — réconciliation des remboursements d'inscription restés
 * REFUND_PENDING : relit l'état réel chez SterPlatform et fait converger (confirmé / échec).
 * Toute la logique vit dans lib/payments/refundReconciliation.ts (testée séparément) ; ce
 * script n'est qu'un point d'entrée CLI fin, destiné à une Coolify Scheduled Task (aucun
 * scheduler dans ce projet Next.js, même modèle que les purges).
 *
 * Usage (un mode explicite est OBLIGATOIRE, comme les autres scripts opérationnels) :
 *   npm run reconcile:refunds -- --dry-run     # relit et affiche, n'écrit rien
 *   npm run reconcile:refunds -- --apply       # écrit les états confirmés/en échec
 *   options : --limit=N (défaut 100, max 1000 inscriptions par passage)
 *             --min-age-minutes=N (défaut 60 : inscriptions plus récentes ignorées)
 *
 * Ne demande JAMAIS de remboursement (lecture seule côté SterPlatform).
 *
 * Codes de sortie : 0 = succès, 1 = au moins une inscription en erreur ou un paiement illisible
 * chez SterPlatform, 2 = usage invalide / configuration manquante.
 *
 * Nécessite DATABASE_URL, NEXT_PUBLIC_API_URL et STER_API_TOKEN (déjà présentes dans le conteneur).
 */
import {
  reconcilePendingRefunds,
  DEFAULT_REFUND_MIN_AGE_MINUTES,
  DEFAULT_REFUND_RECONCILIATION_LIMIT,
  MAX_REFUND_RECONCILIATION_LIMIT,
} from "@/lib/payments/refundReconciliation";
import { prisma } from "@/lib/db/client";

type CliOptions = { dryRun: boolean; limit: number; minAgeMinutes: number };

function parsePositiveInt(arg: string, prefix: string): number | null {
  const n = Number(arg.slice(prefix.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseArgs(argv: string[]): CliOptions | string {
  let dryRun = false;
  let apply = false;
  let limit = DEFAULT_REFUND_RECONCILIATION_LIMIT;
  let minAgeMinutes = DEFAULT_REFUND_MIN_AGE_MINUTES;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--apply") apply = true;
    else if (arg.startsWith("--limit=")) {
      const n = parsePositiveInt(arg, "--limit=");
      if (n === null || n > MAX_REFUND_RECONCILIATION_LIMIT) return `--limit invalide (1 à ${MAX_REFUND_RECONCILIATION_LIMIT}) : ${arg}`;
      limit = n;
    } else if (arg.startsWith("--min-age-minutes=")) {
      const n = parsePositiveInt(arg, "--min-age-minutes=");
      if (n === null) return `--min-age-minutes invalide : ${arg}`;
      minAgeMinutes = n;
    } else return `Argument inconnu : ${arg}`;
  }
  if (dryRun === apply) return "Préciser exactement un mode : --dry-run (lecture seule) ou --apply (écriture des états).";
  return { dryRun, limit, minAgeMinutes };
}

/** Hôte/base cible sans identifiants — permet à l'opérateur de vérifier qu'il vise la bonne base. */
function describeDatabaseTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(DATABASE_URL illisible)";
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    console.error(`[reconcile-refunds] ${parsed}`);
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[reconcile-refunds] DATABASE_URL absente de l'environnement.");
    return 2;
  }
  // Sans SterPlatform, chaque relecture serait « illisible » : refuser d'emblée, message clair.
  if (!process.env.NEXT_PUBLIC_API_URL || !process.env.STER_API_TOKEN) {
    console.error("[reconcile-refunds] NEXT_PUBLIC_API_URL ou STER_API_TOKEN absente de l'environnement.");
    return 2;
  }

  const mode = parsed.dryRun ? "DRY-RUN (aucune écriture)" : "APPLY (écriture des états)";
  console.log(
    `[reconcile-refunds] Mode ${mode} — base ${describeDatabaseTarget(databaseUrl)} — ` +
      `au plus ${parsed.limit} inscription(s) REFUND_PENDING de plus de ${parsed.minAgeMinutes} min.`,
  );

  const report = await reconcilePendingRefunds({
    dryRun: parsed.dryRun,
    limit: parsed.limit,
    minAgeMinutes: parsed.minAgeMinutes,
    log: (message) => console.error(message),
  });

  console.log(
    `[reconcile-refunds] ${report.dryRun ? "DRY-RUN" : "APPLY"} terminé — ${report.scanned} inscription(s) relue(s) ; ` +
      `${report.confirmed} remboursement(s) confirmé(s) ; ${report.failed} en échec (alerte) ; ` +
      `${report.stillPending} encore en cours ; ${report.notRequested} jamais demandé(s) ; ` +
      `${report.missingPaymentId} sans identifiant de paiement ; ${report.unexpected} incohérent(s) ; ` +
      `${report.unreadable} illisible(s) ; ${report.errors} erreur(s).`,
  );

  // Code non nul = alerte pour la tâche planifiée : SterPlatform injoignable ou base en erreur.
  return report.errors > 0 || report.unreadable > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("[reconcile-refunds] Échec inattendu :", err);
    return 1;
  })
  .then(async (code) => {
    await prisma.$disconnect().catch((err) => console.error("[reconcile-refunds] Déconnexion Prisma :", err));
    process.exit(code);
  });
