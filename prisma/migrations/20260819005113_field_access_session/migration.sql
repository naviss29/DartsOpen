-- CreateEnum
CREATE TYPE "FieldSessionRole" AS ENUM ('PLAYER', 'REFEREE');

-- CreateTable
CREATE TABLE "field_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "role" "FieldSessionRole" NOT NULL DEFAULT 'PLAYER',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_sessions_token_hash_key" ON "field_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "field_sessions_match_id_idx" ON "field_sessions"("match_id");

-- CreateIndex
CREATE INDEX "field_sessions_expires_at_idx" ON "field_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "field_sessions" ADD CONSTRAINT "field_sessions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_sessions" ADD CONSTRAINT "field_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
