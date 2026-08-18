-- DO-SPORT-001 — fiabilisation transactionnelle du moteur sportif

-- AlterTable: matches.quick_advance_processed_at — garde d'idempotence pour l'avancement du
-- tournoi rapide (perte de vie + création des matchs suivants), voir docblock du champ dans
-- schema.prisma.
ALTER TABLE "matches" ADD COLUMN "quick_advance_processed_at" TIMESTAMP(3);

-- Contrainte partielle 1/2 — au plus un match IN_PROGRESS par (tournoi, cible réelle) : une
-- cible ne peut jamais avoir deux matchs actifs simultanément. board_number = 0 est la file
-- d'attente globale (non affectée à une cible réelle) — délibérément exclue, de nombreux
-- matchs PENDING peuvent légitimement y coexister.
CREATE UNIQUE INDEX "matches_one_active_per_board"
  ON "matches" ("tournament_id", "board_number")
  WHERE "status" = 'IN_PROGRESS' AND "board_number" > 0;

-- Contrainte partielle 2/2 — au plus un match par (tournoi, type de bracket, round, position)
-- hors matchs de poule (pool_id NULL identifie un match de bracket, voir dbDeleteBracketMatches
-- déjà existant qui utilise la même convention). Filet de sécurité derrière le verrou
-- applicatif (withTournamentLock) contre la création en double d'un même tour/slot de bracket
-- sous concurrence — jamais le seul mécanisme de protection.
CREATE UNIQUE INDEX "matches_unique_bracket_slot"
  ON "matches" ("tournament_id", "bracket_type", "bracket_round", "bracket_position")
  WHERE "pool_id" IS NULL;
