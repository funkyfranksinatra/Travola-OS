-- CreateTable
CREATE TABLE "ServiceDayStaff" (
    "serviceDate" DATE NOT NULL,
    "roster" TEXT[],
    "sections" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDayStaff_pkey" PRIMARY KEY ("serviceDate")
);
