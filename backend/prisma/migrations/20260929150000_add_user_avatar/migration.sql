-- CreateTable
CREATE TABLE "app_meta" (
    "id" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 0,
    "bookId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPushAt" TIMESTAMPTZ(6),
    "lastPushApp" TEXT,

    CONSTRAINT "app_meta_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" BYTEA,
ADD COLUMN     "avatarMime" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");
