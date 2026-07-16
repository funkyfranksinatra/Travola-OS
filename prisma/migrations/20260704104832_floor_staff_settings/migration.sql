-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "onShift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isManualOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "openMinutes" INTEGER,
    "closeMinutes" INTEGER,
    "roles" TEXT[] DEFAULT ARRAY['waiter', 'bartender']::TEXT[],
    "prefs" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("id")
);
