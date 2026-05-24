-- CreateTable
CREATE TABLE "organizations" (
    "user_id" TEXT NOT NULL,
    "stripe_account_id" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("user_id")
);
