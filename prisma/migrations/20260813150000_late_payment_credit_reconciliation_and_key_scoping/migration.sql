-- DARTSOPEN-MONETIZATION-003 (P1/P3/P4)

-- AlterEnum: TournamentStatus — new PENDING_ENTITLEMENT value (P3), added but never used within
-- this same migration transaction (Postgres forbids using a freshly-added enum value in the
-- same transaction that added it).
ALTER TYPE "TournamentStatus" ADD VALUE 'PENDING_ENTITLEMENT';

-- AlterEnum: RegistrationStatus — new REFUNDED value (P1, late payment received after the
-- reservation expired and the slot was reclaimed by someone else).
ALTER TYPE "RegistrationStatus" ADD VALUE 'REFUNDED';

-- AlterTable: tournaments.idempotency_key — was globally UNIQUE, now scoped to (user_id,
-- idempotency_key) (P4, audit fix: a key submitted by organizer B could otherwise collide with
-- organizer A's own key and hand B a reference to A's tournament). Existing rows keep their
-- current idempotency_key value (each currently unique, so trivially still unique per user).
DROP INDEX "tournaments_idempotency_key_key";
CREATE UNIQUE INDEX "tournaments_user_id_idempotency_key_key" ON "tournaments"("user_id", "idempotency_key");
