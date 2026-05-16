-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('ONLINE', 'ONSITE');

-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('ELECTRONIC', 'TRADITIONAL');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "max_players" INTEGER NOT NULL,
    "entry_fee" INTEGER NOT NULL DEFAULT 0,
    "nb_pools" INTEGER NOT NULL DEFAULT 1,
    "nb_boards" INTEGER NOT NULL DEFAULT 1,
    "advancement_per_pool" INTEGER NOT NULL DEFAULT 1,
    "players_per_team" INTEGER NOT NULL DEFAULT 1,
    "registration_mode" "RegistrationMode" NOT NULL DEFAULT 'ONLINE',
    "scoring_mode" "ScoringMode" NOT NULL DEFAULT 'ELECTRONIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "round_order" INTEGER NOT NULL,
    "game_type" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "finish_type" TEXT NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "player_email" TEXT NOT NULL,
    "player_phone" TEXT,
    "player_names" JSONB NOT NULL DEFAULT '[]',
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "qr_code_token" TEXT NOT NULL,
    "stripe_session_id" TEXT,
    "entry_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "platform_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "fee_collected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_players" (
    "pool_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "pool_players_pkey" PRIMARY KEY ("pool_id","registration_id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "pool_id" TEXT,
    "bracket_round" INTEGER,
    "bracket_position" INTEGER,
    "board_number" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "player1_id" TEXT NOT NULL,
    "player2_id" TEXT,
    "winner_id" TEXT,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_sets" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "score_p1" INTEGER NOT NULL DEFAULT 0,
    "score_p2" INTEGER NOT NULL DEFAULT 0,
    "winner_id" TEXT,
    "validated_p1" BOOLEAN NOT NULL DEFAULT false,
    "validated_p2" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "match_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_qr_code_token_key" ON "registrations"("qr_code_token");

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_players" ADD CONSTRAINT "pool_players_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_players" ADD CONSTRAINT "pool_players_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sets" ADD CONSTRAINT "match_sets_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sets" ADD CONSTRAINT "match_sets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sets" ADD CONSTRAINT "match_sets_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
