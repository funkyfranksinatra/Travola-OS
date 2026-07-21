-- Additive, tenant-scoped durable forecast storage. Existing predictor rows
-- remain untouched; new writes begin only with the accompanying code deploy.
CREATE TABLE "ShiftForecast" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftForecast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftForecast_restaurantId_date_key" ON "ShiftForecast"("restaurantId", "date");
CREATE INDEX "ShiftForecast_restaurantId_createdAt_idx" ON "ShiftForecast"("restaurantId", "createdAt");

ALTER TABLE "ShiftForecast"
  ADD CONSTRAINT "ShiftForecast_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One post-close score per restaurant/service date makes a corrective
-- rerun idempotent even if the watchdog endpoint is invoked twice.
CREATE TABLE "ForecastAccuracy" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "predicted" JSONB NOT NULL,
  "actual" JSONB NOT NULL,
  "errorScore" DOUBLE PRECISION NOT NULL,
  "triggeredRerun" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastAccuracy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastAccuracy_restaurantId_date_key" ON "ForecastAccuracy"("restaurantId", "date");
CREATE INDEX "ForecastAccuracy_restaurantId_createdAt_idx" ON "ForecastAccuracy"("restaurantId", "createdAt");

ALTER TABLE "ForecastAccuracy"
  ADD CONSTRAINT "ForecastAccuracy_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
