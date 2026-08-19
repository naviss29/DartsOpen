-- CreateTable
CREATE TABLE "field_referee_grants" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_referee_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_referee_grants_token_hash_key" ON "field_referee_grants"("token_hash");

-- CreateIndex
CREATE INDEX "field_referee_grants_match_id_idx" ON "field_referee_grants"("match_id");

-- CreateIndex
CREATE INDEX "field_referee_grants_expires_at_idx" ON "field_referee_grants"("expires_at");

-- AddForeignKey
ALTER TABLE "field_referee_grants" ADD CONSTRAINT "field_referee_grants_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_referee_grants" ADD CONSTRAINT "field_referee_grants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
