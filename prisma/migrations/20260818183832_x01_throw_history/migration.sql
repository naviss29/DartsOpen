-- CreateTable
CREATE TABLE "match_set_throws" (
    "id" TEXT NOT NULL,
    "match_set_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "score_entered" INTEGER NOT NULL,
    "remaining_before" INTEGER NOT NULL,
    "remaining_after" INTEGER NOT NULL,
    "bust" BOOLEAN NOT NULL DEFAULT false,
    "client_request_id" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_set_throws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_set_throws_match_set_id_idx" ON "match_set_throws"("match_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_set_throws_match_set_id_sequence_key" ON "match_set_throws"("match_set_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "match_set_throws_match_set_id_client_request_id_key" ON "match_set_throws"("match_set_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_set_throws_match_set_id_cancel_request_id_key" ON "match_set_throws"("match_set_id", "cancel_request_id");

-- AddForeignKey
ALTER TABLE "match_set_throws" ADD CONSTRAINT "match_set_throws_match_set_id_fkey" FOREIGN KEY ("match_set_id") REFERENCES "match_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_set_throws" ADD CONSTRAINT "match_set_throws_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
