-- Performance indexes

-- Tournament: lookup by owner
CREATE INDEX "tournaments_user_id_idx" ON "tournaments"("user_id");

-- Round: lookup by tournament
CREATE INDEX "rounds_tournament_id_idx" ON "rounds"("tournament_id");

-- Registration: lookup by tournament (and filtered by status)
CREATE INDEX "registrations_tournament_id_idx" ON "registrations"("tournament_id");
CREATE INDEX "registrations_tournament_id_status_idx" ON "registrations"("tournament_id", "status");

-- Pool: lookup by tournament
CREATE INDEX "pools_tournament_id_idx" ON "pools"("tournament_id");

-- PoolPlayer: reverse lookup by registration (pool_id is already leading PK column)
CREATE INDEX "pool_players_registration_id_idx" ON "pool_players"("registration_id");

-- Match: various tournament-scoped lookups
CREATE INDEX "matches_tournament_id_idx" ON "matches"("tournament_id");
CREATE INDEX "matches_tournament_id_bracket_round_idx" ON "matches"("tournament_id", "bracket_round");
CREATE INDEX "matches_tournament_id_pool_id_status_idx" ON "matches"("tournament_id", "pool_id", "status");
CREATE INDEX "matches_pool_id_idx" ON "matches"("pool_id");

-- MatchSet: lookup by match
CREATE INDEX "match_sets_match_id_idx" ON "match_sets"("match_id");
