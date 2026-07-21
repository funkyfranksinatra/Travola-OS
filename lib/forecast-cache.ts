// Durable predictor output store. The legacy module name is intentionally
// retained so read-only consumers cannot accidentally wake live research.
import { prisma } from "@/lib/prisma";

export type ForecastSource = "manual" | "weekly" | "autocorrect";

const sourceRank: Record<ForecastSource, number> = { manual: 3, autocorrect: 2, weekly: 1 };

function preferred<T extends { source: string; createdAt: Date }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const rank = (sourceRank[b.source as ForecastSource] || 0) - (sourceRank[a.source as ForecastSource] || 0);
    return rank || b.createdAt.getTime() - a.createdAt.getTime();
  })[0] || null;
}

export async function putForecastCache(restaurantId: string, date: string, value: unknown, source: ForecastSource = "manual") {
  return prisma.shiftForecast.create({
    data: { restaurantId, date, source, payload: value as object },
  });
}

export async function getStoredForecast(restaurantId: string, date: string) {
  const rows = await prisma.shiftForecast.findMany({ where: { restaurantId, date }, orderBy: { createdAt: "desc" } });
  const row = preferred(rows);
  return row ? { payload: row.payload, source: row.source as ForecastSource, createdAt: row.createdAt } : null;
}

export async function getForecastCache(restaurantId: string, date: string) {
  const hit = await getStoredForecast(restaurantId, date);
  return hit?.payload ?? null;
}
