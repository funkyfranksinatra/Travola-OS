import { getShiftIntel } from "@/lib/shift-intel";
import { requireRestaurantId } from "@/lib/tenant";
import { todayKey } from "@/lib/db-mappers";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A lightweight authenticated prewarm/read endpoint. It deliberately has no
// research path: opening a future date only assembles deterministic data.
export async function GET(req: Request) {
  const auth = requireRestaurantId(req);
  if ("response" in auth) return auth.response;
  const candidate = new URL(req.url).searchParams.get("date") || "";
  const date = DATE.test(candidate) ? candidate : todayKey();
  return Response.json(await getShiftIntel(auth.restaurantId, date));
}
