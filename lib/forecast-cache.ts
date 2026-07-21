// Durable predictor output store. The legacy module name is intentionally
// retained so read-only consumers cannot accidentally wake live research.
import { prisma } from "@/lib/prisma";

export type ForecastSource = "manual" | "weekly" | "autocorrect";

export async function putForecastCache(restaurantId: string, date: string, value: unknown, source: ForecastSource = "manual") {
  return prisma.shiftForecast.upsert({
    where: { restaurantId_date: { restaurantId, date } },
    create: { restaurantId, date, source, payload: value as object },
    update: { source, payload: value as object, createdAt: new Date() },
  });
}

export async function getStoredForecast(restaurantId: string, date: string) {
  const row = await prisma.shiftForecast.findUnique({ where: { restaurantId_date: { restaurantId, date } } });
  return row ? { payload: row.payload, source: row.source as ForecastSource, createdAt: row.createdAt } : null;
}

export async function getForecastCache(restaurantId: string, date: string) {
  const hit = await getStoredForecast(restaurantId, date);
  return hit?.payload ?? null;
}
