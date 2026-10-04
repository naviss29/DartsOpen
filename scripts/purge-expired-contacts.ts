#!/usr/bin/env tsx
/**
 * RGPD-001 — purge globale planifiée des coordonnées de contact expirées (BAPPS-LEGAL-005 §9).
 * Toute la logique vit dans lib/db/contactRetention.ts (testée séparément) ; ce script n'est
 * qu'un point d'entrée CLI fin, destiné à une Coolify Scheduled Task (aucun scheduler dans ce
 * projet Next.js).
 *
 * Usage (un mode explicite est OBLIGATOIRE — incident DartsOpen : aucun outil destructif ne
 * doit pouvoir écrire parce qu'on a oublié un flag) :
 *   npm run purge:expired-contacts -- --dry-run     # compte seulement, n'écrit rien
 *   npm run purge:expired-contacts -- --apply       # purge réelle (tâche planifiée)
 *   options : --batch-size=N (défaut 100 tournois par lot)
 *
 * Codes de sortie : 0 = succès (y compris « rien à purger »), 1 = au moins un lot en échec ou
 * erreur inattendue, 2 = usage invalide / configuration manquante.
 *
 * Nécessite DATABASE_URL, déjà présente dans le conteneur. En local, la charger explicitement,
 * ex. : node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/purge-expired-contacts.ts --dry-run
 */
import { purgeExpiredContacts, DEFAULT_PURGE_BATCH_SIZE, CONTACT_RETENTION_MONTHS } from "@/lib/db/contactRetention";
import { prisma } from "@/lib/db/client";

type CliOptions = { dryRun: boolean; batchSize: number };

function parseArgs(argv: string[]): CliOptions | string {
  let dryRun = false;
  let apply = false;
  let batchSize = DEFAULT_PURGE_BATCH_SIZE;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--apply") apply = true;
    else if (arg.startsWith("--batch-size=")) {
      batchSize = Number(arg.slice("--batch-size=".length));
      if (!Number.isInteger(batchSize) || batchSize <= 0) return `--batch-size invalide : ${arg}`;
    } else return `Argument inconnu : ${arg}`;
  }
  if (dryRun === apply) return "Préciser exactement un mode : --dry-run (comptage) ou --apply (purge réelle).";
  return { dryRun, batchSize };
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
    console.error(`[purge-expired-contacts] ${parsed}`);
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[purge-expired-contacts] DATABASE_URL absente de l'environnement.");
    return 2;
  }

  const mode = parsed.dryRun ? "DRY-RUN (aucune écriture)" : "APPLY (purge réelle)";
  console.log(
    `[purge-expired-contacts] Mode ${mode} — base ${describeDatabaseTarget(databaseUrl)} — ` +
      `rétention ${CONTACT_RETENTION_MONTHS} mois après un tournoi FINISHED, lots de ${parsed.batchSize} tournois.`,
  );

  const report = await purgeExpiredContacts({
    dryRun: parsed.dryRun,
    batchSize: parsed.batchSize,
    log: (message) => console.error(message),
  });

  console.log(
    `[purge-expired-contacts] ${report.dryRun ? "DRY-RUN" : "APPLY"} terminé — seuil : tournois antérieurs au ` +
      `${report.cutoff.toISOString()} ; ${report.tournamentsScanned} tournoi(s) expiré(s) parcouru(s) en ` +
      `${report.batches} lot(s) ; ${report.registrationsEligible} inscription(s) avec coordonnées ` +
      `${report.dryRun ? "à purger" : "trouvée(s)"} ; ${report.registrationsPurged} purgée(s) ; ` +
      `${report.errors} lot(s) en erreur.`,
  );

  // Code non nul = alerte pour la tâche planifiée : une purge partielle n'est jamais un succès.
  return report.errors > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("[purge-expired-contacts] Échec inattendu :", err);
    return 1;
  })
  .then(async (code) => {
    await prisma.$disconnect().catch((err) => console.error("[purge-expired-contacts] Déconnexion Prisma :", err));
    process.exit(code);
  });
