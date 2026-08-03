/*
  Warnings:

  - You are about to drop the column `stripe_account_id` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_session_id` on the `registrations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "matches" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "stripe_account_id",
ADD COLUMN     "ster_organization_slug" TEXT;

-- AlterTable
ALTER TABLE "registrations" DROP COLUMN "stripe_session_id",
ADD COLUMN     "ster_payment_id" TEXT;
