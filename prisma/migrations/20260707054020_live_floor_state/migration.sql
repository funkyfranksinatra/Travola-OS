-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "assignedServerId" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "liveUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "party" TEXT,
ADD COLUMN     "partySize" INTEGER,
ADD COLUMN     "seatedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'available';
