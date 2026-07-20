// A deliberately small, process-local cache of completed predictor output.
// Co-pilot may read this only; it must never wake the web-research pipeline.
type CachedForecast = { value: unknown; expiresAt: number };

const forecasts = new Map<string, CachedForecast>();
const TTL_MS = 30 * 60 * 1000;

const keyFor = (restaurantId: string, date: string) => `${restaurantId}:${date}`;

export function putForecastCache(restaurantId: string, date: string, value: unknown) {
  forecasts.set(keyFor(restaurantId, date), { value, expiresAt: Date.now() + TTL_MS });
}

export function getForecastCache(restaurantId: string, date: string) {
  const key = keyFor(restaurantId, date);
  const hit = forecasts.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    forecasts.delete(key);
    return null;
  }
  return hit.value;
}
