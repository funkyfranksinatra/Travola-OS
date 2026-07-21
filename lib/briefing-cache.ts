type CachedBriefing = { value: unknown; expiresAt: number };

const briefings = new Map<string, CachedBriefing>();
const TTL_MS = 30 * 60 * 1000;
const keyFor = (restaurantId: string, date: string) => `${restaurantId}:${date}`;

export function getBriefingCache(restaurantId: string, date: string) {
  const key = keyFor(restaurantId, date);
  const hit = briefings.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    briefings.delete(key);
    return null;
  }
  return hit.value;
}

export function putBriefingCache(restaurantId: string, date: string, value: unknown) {
  briefings.set(keyFor(restaurantId, date), { value, expiresAt: Date.now() + TTL_MS });
}

export function clearBriefingCache(restaurantId: string, date: string) {
  briefings.delete(keyFor(restaurantId, date));
}
