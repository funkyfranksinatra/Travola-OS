import { after } from "next/server";
import { activeRestaurantIds, runWeeklyForecast } from "@/lib/shift-forecast-jobs";
import { cronAuthorized } from "@/lib/cron-auth";
import { canonicalShiftDate, restaurantShiftDate, shiftDateOffset } from "@/lib/shift-intel";

export const maxDuration = 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const week = (from: string) => Array.from({ length: 7 }, (_, index) => shiftDateOffset(from, index));

async function runOne(restaurantId: string, start?: string) {
  const serviceStart = start || await restaurantShiftDate(restaurantId);
  const result = await runWeeklyForecast(restaurantId, week(serviceStart));
  return { restaurantId, dates: result.dates, research: result.research };
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const requestedDate = url.searchParams.get("date");
  const start = DATE.test(requestedDate || "") ? canonicalShiftDate(String(requestedDate)) : undefined;
  if (restaurantId) return Response.json(await runOne(restaurantId, start));
  const ids = await activeRestaurantIds();
  // Each restaurant gets its own bounded invocation. `after` uses Vercel's
  // waitUntil support, so the scheduler responds quickly rather than keeping
  // a single cron function alive while research fans out.
  const origin = url.origin;
  const secret = process.env.CRON_SECRET!;
  after(async () => {
    await Promise.allSettled(ids.map((id) => fetch(`${origin}/api/cron/shift-forecast?restaurantId=${encodeURIComponent(id)}${start ? `&date=${start}` : ""}`, { headers: { authorization: `Bearer ${secret}` } })));
  });
  return Response.json({ ok: true, queuedRestaurants: ids.length, date: start || "per-restaurant today", mode: "fanout" });
}
