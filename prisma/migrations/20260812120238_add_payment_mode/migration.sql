-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('ONLINE', 'ONSITE');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "payment_mode" "PaymentMode" NOT NULL DEFAULT 'ONSITE';

-- DARTSOPEN-MONETIZATION-001 (mission §12/§15) : avant cette migration, createRegistration()
-- tentait un paiement en ligne pour TOUT tournoi payant en registration_mode ONLINE, sans
-- notion de payment_mode distincte. Pour ne jamais casser un tournoi déjà configuré et
-- fonctionnel de cette façon, tout tournoi qui aurait aujourd'hui réellement déclenché ce
-- chemin (registration_mode = ONLINE ET entry_fee > 0) est explicitement basculé sur
-- payment_mode = 'ONLINE' — reproduisant exactement le comportement déjà en place. Tous les
-- autres tournois (gratuits, ou déjà ONSITE) restent sur le défaut ONSITE ci-dessus, qui ne
-- change rien à leur comportement actuel (ONSITE ne déclenchait déjà aucun paiement en ligne).
UPDATE "tournaments"
SET "payment_mode" = 'ONLINE'
WHERE "registration_mode" = 'ONLINE' AND "entry_fee" > 0;
