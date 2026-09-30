-- DO-UNFINISHED-PURGE-001 — horodatage du rappel de clôture (tournoi jamais terminé).
-- Additive et nullable : l'ancienne image continue de fonctionner pendant le déploiement/rollback.
-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "close_reminder_sent_at" TIMESTAMP(3);
