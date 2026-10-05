-- F13 (audit du 04/10/2026) — horodatage « échec du remboursement confirmé par SterPlatform »
-- d'une inscription REFUND_PENDING, affiché à l'organisateur (aucune relance automatique).
-- Additive et nullable : l'ancienne image l'ignore et continue de voir un REFUND_PENDING.
-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "refund_failed_at" TIMESTAMP(3);
