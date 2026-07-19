import { getRestaurantId } from "@/lib/session";

export function requireRestaurantId(req: Request) {
  const restaurantId = getRestaurantId(req);
  return restaurantId ? { restaurantId } : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
}
