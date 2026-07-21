-- Preserve every forecast revision so source precedence is deterministic:
-- manual (newest) > autocorrect (newest) > weekly (newest).  This changes
-- only an index; it does not alter or delete any production forecast row.
DROP INDEX "ShiftForecast_restaurantId_date_key";
CREATE INDEX "ShiftForecast_restaurantId_date_source_createdAt_idx"
  ON "ShiftForecast"("restaurantId", "date", "source", "createdAt");
