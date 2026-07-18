-- Phase A, step 2: run only after prisma/backfill-tenancy.ts reports no
-- NULL restaurant ids. This migration changes no record values.
ALTER TABLE "Guest" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "Table" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "Server" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "Reservation" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "WaitlistEntry" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "Shift" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "ShiftServer" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "Floor" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "RestaurantSettings" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "ServiceDayStaff" ALTER COLUMN "restaurantId" SET NOT NULL;

DROP INDEX "Guest_phone_key";
DROP INDEX "Guest_email_key";
CREATE UNIQUE INDEX "Guest_restaurantId_phone_key" ON "Guest"("restaurantId", "phone");
CREATE UNIQUE INDEX "Guest_restaurantId_email_key" ON "Guest"("restaurantId", "email");

DROP INDEX "Table_floorId_name_key";
DROP INDEX "Table_floorId_name_active_key";
CREATE UNIQUE INDEX "Table_restaurantId_floorId_name_key" ON "Table"("restaurantId", "floorId", "name");
CREATE UNIQUE INDEX "Table_restaurantId_floorId_name_active_key" ON "Table"("restaurantId", "floorId", "name") WHERE "active";

DROP INDEX "Shift_serviceDate_period_key";
CREATE UNIQUE INDEX "Shift_restaurantId_serviceDate_period_key" ON "Shift"("restaurantId", "serviceDate", "period");

ALTER TABLE "ServiceDayStaff" DROP CONSTRAINT "ServiceDayStaff_pkey";
ALTER TABLE "ServiceDayStaff" ADD CONSTRAINT "ServiceDayStaff_pkey" PRIMARY KEY ("restaurantId", "serviceDate");

CREATE INDEX "Guest_restaurantId_vip_idx" ON "Guest"("restaurantId", "vip");
CREATE INDEX "Guest_restaurantId_name_idx" ON "Guest"("restaurantId", "name");
CREATE INDEX "Table_restaurantId_active_floorId_idx" ON "Table"("restaurantId", "active", "floorId");
CREATE INDEX "Server_restaurantId_active_idx" ON "Server"("restaurantId", "active");
CREATE INDEX "Reservation_restaurantId_serviceDate_status_idx" ON "Reservation"("restaurantId", "serviceDate", "status");
CREATE INDEX "Reservation_restaurantId_dayOfWeek_serviceDate_idx" ON "Reservation"("restaurantId", "dayOfWeek", "serviceDate");
CREATE INDEX "Reservation_restaurantId_status_targetTime_idx" ON "Reservation"("restaurantId", "status", "targetTime");
CREATE INDEX "Reservation_restaurantId_guestId_serviceDate_idx" ON "Reservation"("restaurantId", "guestId", "serviceDate");
CREATE INDEX "WaitlistEntry_restaurantId_serviceDate_status_idx" ON "WaitlistEntry"("restaurantId", "serviceDate", "status");
CREATE INDEX "WaitlistEntry_restaurantId_status_arrivalTime_idx" ON "WaitlistEntry"("restaurantId", "status", "arrivalTime");
CREATE INDEX "WaitlistEntry_restaurantId_dayOfWeek_serviceDate_idx" ON "WaitlistEntry"("restaurantId", "dayOfWeek", "serviceDate");
CREATE INDEX "Shift_restaurantId_dayOfWeek_period_serviceDate_idx" ON "Shift"("restaurantId", "dayOfWeek", "period", "serviceDate");
CREATE INDEX "Shift_restaurantId_isFinalized_serviceDate_idx" ON "Shift"("restaurantId", "isFinalized", "serviceDate");
CREATE INDEX "ShiftServer_restaurantId_serverId_idx" ON "ShiftServer"("restaurantId", "serverId");
