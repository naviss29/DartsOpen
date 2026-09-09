-- CreateIndex
CREATE INDEX "matches_tournament_id_status_board_number_idx" ON "matches"("tournament_id", "status", "board_number");
