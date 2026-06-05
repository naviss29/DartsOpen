-- CreateEnum
CREATE TYPE "BracketType" AS ENUM ('SINGLE', 'WINNERS', 'LOSERS', 'GRAND_FINAL');

-- AlterTable tournaments: add quick_mode
ALTER TABLE "tournaments" ADD COLUMN "quick_mode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable registrations: add lives
ALTER TABLE "registrations" ADD COLUMN "lives" INTEGER NOT NULL DEFAULT 2;

-- AlterTable matches: add bracket_type
ALTER TABLE "matches" ADD COLUMN "bracket_type" "BracketType" NOT NULL DEFAULT 'SINGLE';
