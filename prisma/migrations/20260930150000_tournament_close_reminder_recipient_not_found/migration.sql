-- DO-UNFINISHED-PURGE-001 (complément 30/09/2026) — horodatage « créateur introuvable côté
-- SterPlatform (404 USER_NOT_FOUND) constaté », qui autorise la suppression sans rappel
-- à partir de J+1 00:00 UTC + 48 h.
-- Additive et nullable : l'ancienne image l'ignore (elle ne supprime jamais sans rappel).
-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "close_reminder_recipient_not_found_at" TIMESTAMP(3);
