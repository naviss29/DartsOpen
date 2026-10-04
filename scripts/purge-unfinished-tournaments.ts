#!/usr/bin/env tsx
/**
 * DO-UNFINISHED-PURGE-001 — rappel puis suppression des tournois jamais terminés (décision Alan,
 * 30/09/2026). Toute la logique vit dans lib/db/unfinishedTournamentPurge.ts (testée
 * séparément) ; ce script n'est qu'un point d'entrée CLI fin, destiné à une Coolify Scheduled
 * Task (aucun scheduler dans ce projet Next.js).
 *
 * Script distinct de purge-expired-contacts.ts (et non une option de celui-ci) : effets externes
 * différents (emails via SterPlatform), suppression de tournois entiers et non d'une colonne,
 * et surtout activable/désactivable indépendamment dans Coolify — la purge RGPD ne doit jamais
 * être bloquée ou mise en échec par l'indisponibilité de l'envoi de rappels.
 *
 * Usage (un mode explicite est OBLIGATOIRE — incident DartsOpen : aucun outil destructif ne
 * doit pouvoir écrire parce qu'on a oublié un flag) :
 *   npm run purge:unfinished-tournaments -- --dry-run   # liste rappels/suppressions, n'écrit rien, n'envoie rien
 *   npm run purge:unfinished-tournaments -- --apply     # envoie les rappels, supprime les tournois échus
 *   options : --batch-size=N (défaut 100 tournois par page)
 *
 * Destinataires du rappel (ADR-0021 / L7, D6) : tous les OWNER/ADMIN de l'organisation du tournoi
 * (send-to-organization) ; le créateur seul (send-to-user) pour un tournoi sans organisation. Pour
 * un tournoi rattaché, une organisation disparue (404 ORGANIZATION_NOT_FOUND) ou sans
 * administrateur (422) compte comme un destinataire introuvable (décision d'Alan du 01/10/2026) ;
 * un template manquant ou un 404 sans code ne supprime jamais rien.
 *
 * Créateur introuvable côté SterPlatform (404 USER_NOT_FOUND) : constat horodaté, rappel retenté à
 * chaque passage ; à partir de J+1 00:00 UTC + 48 h, si le 404 est reconfirmé, le tournoi est
 * supprimé SANS rappel (décision Alan 30/09/2026) — le bilan distingue « supprimés après rappel »
 * et « supprimés sans rappel (créateur introuvable) ».
 *
 * Codes de sortie : 0 = succès (y compris « rien à faire » et les créateurs introuvables côté
 * SterPlatform, 404 : journalisés par id de tournoi), 1 = au moins un
 * tournoi en échec (rappel non envoyé pour 5xx/réseau, suppression échouée) ou erreur inattendue,
 * 2 = usage invalide / configuration manquante ou rejetée par SterPlatform (401/403, template
 * absent) — dans ce dernier cas les suppressions déjà dues sont quand même traitées, seuls les
 * envois de rappels s'arrêtent (voir purgeUnfinishedTournaments).
 *
 * Nécessite DATABASE_URL, et pour l'envoi des rappels NEXT_PUBLIC_API_URL, STER_API_TOKEN et
 * NEXT_PUBLIC_APP_URL (mêmes variables que l'application, lues au runtime). En local : node --env-file=.env.local node_modules/tsx/dist/cli.mjs
 * scripts/purge-unfinished-tournaments.ts --dry-run
 */
import {
  purgeUnfinishedTournaments,
  DEFAULT_UNFINISHED_PURGE_BATCH_SIZE,
  CLOSE_REMINDER_GRACE_HOURS,
} from "@/lib/db/unfinishedTournamentPurge";
import { createCloseReminderNotifier } from "@/lib/tournament/closeReminderNotifier";
import { prisma } from "@/lib/db/client";

const PREFIX = "[purge-unfinished-tournaments]";

type CliOptions = { dryRun: boolean; batchSize: number };

function parseArgs(argv: string[]): CliOptions | string {
  let dryRun = false;
  let apply = false;
  let batchSize = DEFAULT_UNFINISHED_PURGE_BATCH_SIZE;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--apply") apply = true;
    else if (arg.startsWith("--batch-size=")) {
      batchSize = Number(arg.slice("--batch-size=".length));
      if (!Number.isInteger(batchSize) || batchSize <= 0) return `--batch-size invalide : ${arg}`;
    } else return `Argument inconnu : ${arg}`;
  }
  if (dryRun === apply) return "Préciser exactement un mode : --dry-run (liste seule) ou --apply (rappels et suppressions réels).";
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
    console.error(`${PREFIX} ${parsed}`);
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`${PREFIX} DATABASE_URL absente de l'environnement.`);
    return 2;
  }

  const notifier = createCloseReminderNotifier();
  const mode = parsed.dryRun ? "DRY-RUN (aucune écriture, aucun email)" : "APPLY (rappels et suppressions réels)";
  console.log(
    `${PREFIX} Mode ${mode} — base ${describeDatabaseTarget(databaseUrl)} — rappel à J+1, suppression ` +
      `${CLOSE_REMINDER_GRACE_HOURS} h après le rappel si le tournoi n'est toujours pas FINISHED ; sans rappel ` +
      `à partir de J+1 + ${CLOSE_REMINDER_GRACE_HOURS} h si le créateur reste introuvable (404 USER_NOT_FOUND).`,
  );
  if (!notifier.available) {
    console.error(`${PREFIX} AVERTISSEMENT : envoi des rappels indisponible (${notifier.unavailableReason}) — aucun rappel ne sera horodaté, donc aucune nouvelle suppression planifiée.`);
  }

  const report = await purgeUnfinishedTournaments({
    notifier,
    dryRun: parsed.dryRun,
    batchSize: parsed.batchSize,
    log: (message) => console.log(message),
  });

  const wouldSend = report.entries.filter((e) => e.outcome === "REMINDER_WOULD_SEND").length;
  const wouldDelete = report.entries.filter((e) => e.outcome === "DELETION_WOULD_RUN").length;
  const wouldDeleteWithoutReminder = report.entries.filter((e) => e.outcome === "DELETION_WITHOUT_REMINDER_WOULD_RUN").length;
  console.log(
    `${PREFIX} ${report.dryRun ? "DRY-RUN" : "APPLY"} terminé — ${report.scanned} tournoi(s) non terminé(s) à date passée ; ` +
      (report.dryRun
        ? `${wouldSend} rappel(s) à envoyer ; ${wouldDelete} suppression(s) après rappel à effectuer ; ` +
          `${wouldDeleteWithoutReminder} suppression(s) sans rappel si le créateur est toujours introuvable ; `
        : `${report.remindersSent} rappel(s) envoyé(s) ; ${report.remindersRecipientNotFound} créateur(s) introuvable(s) (404) ; ` +
          `${report.remindersFailed} rappel(s) en échec ; ${report.remindersNotAttempted} rappel(s) non tenté(s) ; ` +
          `${report.deletedAfterReminder} tournoi(s) supprimé(s) après rappel ; ` +
          `${report.deletedWithoutReminder} tournoi(s) supprimé(s) sans rappel (créateur introuvable) ; ` +
          `${report.deletionsFailed} suppression(s) en échec ; ` +
          `${report.spared} épargné(s) ; `) +
      `${report.awaitingGrace} en attente du délai de ${CLOSE_REMINDER_GRACE_HOURS} h ; ${report.errors} tournoi(s) en erreur.`,
  );

  // Code non nul = alerte pour la tâche planifiée : un rappel non parti ou une suppression
  // échouée n'est jamais un succès silencieux. Une configuration cassée (jeton refusé, template
  // absent) a son propre code, 2 : elle bloquera tous les passages suivants tant qu'un humain
  // n'intervient pas, contrairement à une panne SterPlatform passagère (1).
  if (report.configurationError !== null) {
    console.error(`${PREFIX} ERREUR DE CONFIGURATION SterPlatform : ${report.configurationError}`);
    return 2;
  }
  return report.errors > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(`${PREFIX} Échec inattendu :`, err);
    return 1;
  })
  .then(async (code) => {
    await prisma.$disconnect().catch((err) => console.error(`${PREFIX} Déconnexion Prisma :`, err));
    process.exit(code);
  });
