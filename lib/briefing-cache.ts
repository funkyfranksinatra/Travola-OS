import { prisma } from "@/lib/prisma";

const TTL_MS = 30 * 60 * 1000;

export async function getBriefingCache(restaurantId: string, date: string) {
  const hit = await prisma.dailyBriefing.findUnique({
    where: { restaurantId_date: { restaurantId, date } },
    select: { payload: true, createdAt: true },
  });
  if (!hit || hit.createdAt.getTime() + TTL_MS <= Date.now()) return null;
  return hit.payload;
}

export async function putBriefingCache(restaurantId: string, date: string, value: unknown) {
  await prisma.dailyBriefing.upsert({
    where: { restaurantId_date: { restaurantId, date } },
    create: { restaurantId, date, payload: value as never },
    // A re-generation begins a new freshness window without a second timestamp.
    update: { payload: value as never, createdAt: new Date() },
  });
}

export async function clearBriefingCache(restaurantId: string, date: string) {
  await prisma.dailyBriefing.deleteMany({ where: { restaurantId, date } });
}
