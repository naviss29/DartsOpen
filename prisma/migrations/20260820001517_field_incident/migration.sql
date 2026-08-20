-- CreateEnum
CREATE TYPE "FieldIncidentType" AS ENUM ('PLAYER_ABSENT', 'RESULT_DISPUTED', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FieldIncidentReporterRole" AS ENUM ('PLAYER', 'REFEREE', 'ORGANIZER');

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "forfeited_player_id" TEXT;

-- CreateTable
CREATE TABLE "field_incidents" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "type" "FieldIncidentType" NOT NULL,
    "status" "FieldIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "reported_by" "FieldIncidentReporterRole" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "field_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_incidents_tournament_id_status_idx" ON "field_incidents"("tournament_id", "status");

-- CreateIndex
CREATE INDEX "field_incidents_match_id_idx" ON "field_incidents"("match_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_forfeited_player_id_fkey" FOREIGN KEY ("forfeited_player_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_incidents" ADD CONSTRAINT "field_incidents_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_incidents" ADD CONSTRAINT "field_incidents_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DO-FIELD-INCIDENT-001 — index unique partiel (non représentable par la syntaxe @@unique de
-- Prisma, même discipline que les deux contraintes partielles de "matches", voir schema.prisma) :
-- au plus UN incident OPEN par (match, type) — un double-clic/retry sur "Appeler l'organisation"
-- ne crée donc jamais deux incidents identiques ouverts, y compris sous concurrence réelle
-- (l'INSERT concurrent perdant se heurte à cette contrainte, jamais un second incident silencieux).
CREATE UNIQUE INDEX "field_incidents_open_dedup" ON "field_incidents" ("match_id", "type") WHERE "status" = 'OPEN';
