import { after } from "next/server";
import { activeRestaurantIds, runWeeklyForecast } from "@/lib/shift-forecast-jobs";
import { cronAuthorized } from "@/lib/cron-auth";
import { todayKey } from "@/lib/db-mappers";

export const maxDuration = 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * 60 * 60 * 1000;
const week = (from: string) => Array.from({ length: 7 }, (_, index) => new Date(new Date(`${from}T12:00:00Z`).getTime() + index * DAY).toISOString().slice(0, 10));

async function runOne(restaurantId: string, start: string) {
  const result = await runWeeklyForecast(restaurantId, week(start));
  return { restaurantId, dates: result.dates, research: result.research };
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const start = DATE.test(url.searchParams.get("date") || "") ? String(url.searchParams.get("date")) : todayKey();
  if (restaurantId) return Response.json(await runOne(restaurantId, start));
  const ids = await activeRestaurantIds();
  // Each restaurant gets its own bounded invocation. `after` uses Vercel's
  // waitUntil support, so the scheduler responds quickly rather than keeping
  // a single cron function alive while research fans out.
  const origin = url.origin;
  const secret = process.env.CRON_SECRET!;
  after(async () => {
    await Promise.allSettled(ids.map((id) => fetch(`${origin}/api/cron/shift-forecast?restaurantId=${encodeURIComponent(id)}&date=${start}`, { headers: { authorization: `Bearer ${secret}` } })));
  });
  return Response.json({ ok: true, queuedRestaurants: ids.length, mode: "fanout" });
}
