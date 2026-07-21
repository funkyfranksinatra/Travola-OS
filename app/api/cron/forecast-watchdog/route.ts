import { after } from "next/server";
import { activeRestaurantIds, scoreForecastAccuracy } from "@/lib/shift-forecast-jobs";
import { cronAuthorized } from "@/lib/cron-auth";
import { todayKey } from "@/lib/db-mappers";

export const maxDuration = 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const yesterday = () => new Date(new Date(`${todayKey()}T12:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const date = DATE.test(url.searchParams.get("date") || "") ? String(url.searchParams.get("date")) : yesterday();
  if (restaurantId) return Response.json(await scoreForecastAccuracy(restaurantId, date));
  const ids = await activeRestaurantIds();
  const origin = url.origin;
  const secret = process.env.CRON_SECRET!;
  after(async () => {
    await Promise.allSettled(ids.map((id) => fetch(`${origin}/api/cron/forecast-watchdog?restaurantId=${encodeURIComponent(id)}&date=${date}`, { headers: { authorization: `Bearer ${secret}` } })));
  });
  return Response.json({ ok: true, queuedRestaurants: ids.length, date, mode: "fanout" });
}
