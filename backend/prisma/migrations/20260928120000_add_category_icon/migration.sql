-- CreateTable
CREATE TABLE "CategoryIcon" (
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryIcon_pkey" PRIMARY KEY ("userId","name")
);

-- AddForeignKey
ALTER TABLE "CategoryIcon" ADD CONSTRAINT "CategoryIcon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
