-- DARTSOPEN-MONETIZATION-002 (audit DO-AUD-001/DO-AUD-002/DO-AUD-003/DO-AUD-004/DO-AUD-009)

-- AlterTable: tournaments.idempotency_key
-- Added nullable first, backfilled from the row's own already-unique id (never a fabricated
-- value), then made NOT NULL + UNIQUE — a pre-existing tournament predating this mission simply
-- keeps its own id as its (never-reused) idempotency key, exactly reproducing "no key was ever
-- regenerated for it" since nothing will ever resubmit a create request for an already-existing
-- tournament.
ALTER TABLE "tournaments" ADD COLUMN "idempotency_key" TEXT;
UPDATE "tournaments" SET "idempotency_key" = "id" WHERE "idempotency_key" IS NULL;
ALTER TABLE "tournaments" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "tournaments_idempotency_key_key" ON "tournaments"("idempotency_key");

-- AlterTable: tournaments.nb_boards default 1 -> 2 (DARTSOPEN-MONETIZATION-001/002 defaults,
-- DO-AUD-008) — existing rows keep their actual stored value, only affects future inserts that
-- omit the column (defense in depth; application code always supplies it explicitly).
ALTER TABLE "tournaments" ALTER COLUMN "nb_boards" SET DEFAULT 2;

-- AlterTable: registrations.reservation_expires_at (capacity reservation expiry, DO-AUD-003/
-- DO-AUD-004/DO-AUD-009) — nullable, only ever set for a PENDING registration awaiting online
-- payment.
ALTER TABLE "registrations" ADD COLUMN "reservation_expires_at" TIMESTAMP(3);
