-- The canonical additive migration lives in prisma/migrations. This temporary
-- migration directory exists only to execute the required two deployment runs.
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "nameKey" TEXT NOT NULL,
    "passcodeHash" TEXT NOT NULL, "recoveryEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Restaurant_nameKey_key" ON "Restaurant"("nameKey");
ALTER TABLE "Guest" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "Table" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "Server" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "Shift" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "ShiftServer" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "Floor" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "RestaurantSettings" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "ServiceDayStaff" ADD COLUMN "restaurantId" TEXT;
CREATE INDEX "Guest_restaurantId_idx" ON "Guest"("restaurantId");
CREATE INDEX "Table_restaurantId_idx" ON "Table"("restaurantId");
CREATE INDEX "Server_restaurantId_idx" ON "Server"("restaurantId");
CREATE INDEX "Reservation_restaurantId_idx" ON "Reservation"("restaurantId");
CREATE INDEX "WaitlistEntry_restaurantId_idx" ON "WaitlistEntry"("restaurantId");
CREATE INDEX "Shift_restaurantId_idx" ON "Shift"("restaurantId");
CREATE INDEX "ShiftServer_restaurantId_idx" ON "ShiftServer"("restaurantId");
CREATE INDEX "Floor_restaurantId_idx" ON "Floor"("restaurantId");
CREATE UNIQUE INDEX "RestaurantSettings_restaurantId_key" ON "RestaurantSettings"("restaurantId");
CREATE INDEX "ServiceDayStaff_restaurantId_idx" ON "ServiceDayStaff"("restaurantId");
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Table" ADD CONSTRAINT "Table_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Server" ADD CONSTRAINT "Server_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftServer" ADD CONSTRAINT "ShiftServer_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantSettings" ADD CONSTRAINT "RestaurantSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceDayStaff" ADD CONSTRAINT "ServiceDayStaff_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
