-- ADR-0021 / lot L6 — organisation SterPlatform propriétaire du tournoi.
-- Additive et nullable : l'ancienne image ignore ces colonnes (elle autorise encore par
-- créateur), un rollback d'image reste donc possible. Aucun backfill ici : le rattachement
-- des tournois existants est le lot L7 (simulation montrée à Alan d'abord).
-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "organization_slug" TEXT;

-- CreateIndex
CREATE INDEX "tournaments_organization_id_idx" ON "tournaments"("organization_id");

-- CreateIndex
CREATE INDEX "tournaments_organization_slug_idx" ON "tournaments"("organization_slug");
