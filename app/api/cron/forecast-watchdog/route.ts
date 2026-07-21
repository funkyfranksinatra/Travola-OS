import { after } from "next/server";
import { activeRestaurantIds, scoreForecastAccuracy } from "@/lib/shift-forecast-jobs";
import { cronAuthorized } from "@/lib/cron-auth";
import { canonicalShiftDate, restaurantShiftDate, shiftDateOffset } from "@/lib/shift-intel";

export const maxDuration = 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const yesterday = (date?: string) => shiftDateOffset(date || canonicalShiftDate(), -1);

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurantId");
  const requestedDate = url.searchParams.get("date");
  const date = DATE.test(requestedDate || "") ? canonicalShiftDate(String(requestedDate)) : undefined;
  if (restaurantId) {
    const serviceDate = date || yesterday(await restaurantShiftDate(restaurantId));
    return Response.json(await scoreForecastAccuracy(restaurantId, serviceDate));
  }
  const ids = await activeRestaurantIds();
  const origin = url.origin;
  const secret = process.env.CRON_SECRET!;
  after(async () => {
    await Promise.allSettled(ids.map((id) => fetch(`${origin}/api/cron/forecast-watchdog?restaurantId=${encodeURIComponent(id)}${date ? `&date=${date}` : ""}`, { headers: { authorization: `Bearer ${secret}` } })));
  });
  return Response.json({ ok: true, queuedRestaurants: ids.length, date: date || "per-restaurant yesterday", mode: "fanout" });
}
