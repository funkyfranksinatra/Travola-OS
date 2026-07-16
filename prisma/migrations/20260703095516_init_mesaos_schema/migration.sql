-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('UPCOMING', 'SEATED', 'FINISHED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'LEFT');

-- CreateEnum
CREATE TYPE "ShiftPeriod" AS ENUM ('BRUNCH', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('MESAOS', 'PHONE', 'WALK_IN', 'OPENTABLE_IMPORT', 'RESY_IMPORT');

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "shape" TEXT NOT NULL DEFAULT 'square',
    "area" TEXT NOT NULL DEFAULT 'dining',
    "floorId" TEXT NOT NULL DEFAULT 'f1',
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,
    "roles" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'UPCOMING',
    "source" "BookingSource" NOT NULL DEFAULT 'MESAOS',
    "notes" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetTime" TIMESTAMP(3) NOT NULL,
    "seatedTime" TIMESTAMP(3),
    "finishedTime" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "serviceDate" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "turnMinutes" INTEGER,
    "serverId" TEXT,
    "shiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTable" (
    "reservationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReservationTable_pkey" PRIMARY KEY ("reservationId","tableId")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "guestId" TEXT,
    "name" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "source" "BookingSource" NOT NULL DEFAULT 'WALK_IN',
    "arrivalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotedMinutes" INTEGER,
    "quotedTime" TIMESTAMP(3),
    "seatedTime" TIMESTAMP(3),
    "leftTime" TIMESTAMP(3),
    "actualWaitMinutes" INTEGER,
    "serviceDate" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "shiftId" TEXT,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "period" "ShiftPeriod" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "predictedCovers" INTEGER,
    "predictedServers" INTEGER,
    "actualCovers" INTEGER NOT NULL DEFAULT 0,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalWalkIns" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "waitlistWalkAways" INTEGER NOT NULL DEFAULT 0,
    "avgTurnMinutes" DOUBLE PRECISION,
    "avgWaitMinutes" DOUBLE PRECISION,
    "peakOccupancyPct" DOUBLE PRECISION,
    "serversActual" INTEGER,
    "features" JSONB,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftServer" (
    "shiftId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "coversServed" INTEGER NOT NULL DEFAULT 0,
    "tablesWorked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftServer_pkey" PRIMARY KEY ("shiftId","serverId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guest_phone_key" ON "Guest"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_email_key" ON "Guest"("email");

-- CreateIndex
CREATE INDEX "Guest_vip_idx" ON "Guest"("vip");

-- CreateIndex
CREATE INDEX "Guest_name_idx" ON "Guest"("name");

-- CreateIndex
CREATE INDEX "Table_active_floorId_idx" ON "Table"("active", "floorId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_floorId_name_key" ON "Table"("floorId", "name");

-- CreateIndex
CREATE INDEX "Server_active_idx" ON "Server"("active");

-- CreateIndex
CREATE INDEX "Reservation_serviceDate_status_idx" ON "Reservation"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "Reservation_dayOfWeek_serviceDate_idx" ON "Reservation"("dayOfWeek", "serviceDate");

-- CreateIndex
CREATE INDEX "Reservation_status_targetTime_idx" ON "Reservation"("status", "targetTime");

-- CreateIndex
CREATE INDEX "Reservation_guestId_serviceDate_idx" ON "Reservation"("guestId", "serviceDate");

-- CreateIndex
CREATE INDEX "ReservationTable_tableId_idx" ON "ReservationTable"("tableId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_serviceDate_status_idx" ON "WaitlistEntry"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_arrivalTime_idx" ON "WaitlistEntry"("status", "arrivalTime");

-- CreateIndex
CREATE INDEX "WaitlistEntry_dayOfWeek_serviceDate_idx" ON "WaitlistEntry"("dayOfWeek", "serviceDate");

-- CreateIndex
CREATE INDEX "Shift_dayOfWeek_period_serviceDate_idx" ON "Shift"("dayOfWeek", "period", "serviceDate");

-- CreateIndex
CREATE INDEX "Shift_isFinalized_serviceDate_idx" ON "Shift"("isFinalized", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_serviceDate_period_key" ON "Shift"("serviceDate", "period");

-- CreateIndex
CREATE INDEX "ShiftServer_serverId_idx" ON "ShiftServer"("serverId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTable" ADD CONSTRAINT "ReservationTable_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTable" ADD CONSTRAINT "ReservationTable_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftServer" ADD CONSTRAINT "ShiftServer_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftServer" ADD CONSTRAINT "ShiftServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
