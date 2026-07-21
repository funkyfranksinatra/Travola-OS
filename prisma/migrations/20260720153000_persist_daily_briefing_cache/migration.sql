-- Persistent, tenant-scoped cache for generated pre-shift briefings.
-- Additive only: existing application versions ignore this table.
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyBriefing_restaurantId_date_key" ON "DailyBriefing"("restaurantId", "date");

ALTER TABLE "DailyBriefing"
  ADD CONSTRAINT "DailyBriefing_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
