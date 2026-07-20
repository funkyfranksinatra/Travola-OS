// app/api/waitlist/route.ts — walk-in queue persistence.
//
// Lifecycle mapping (WaitlistEntry.status):
//   in the queue          → WAITING  (GET returns these)
//   party gets seated     → PATCH {status:'seated'} → SEATED + seatedTime
//                            + actualWaitMinutes (quote-accuracy training)
//   removed / walked away → DELETE → LEFT + leftTime
// LEFT entries are the predictor's wait-tolerance signal — another
// deliberate soft delete.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";
import { dayOfWeekOf, serviceDateOf, todayKey, waitlistToApp } from "@/lib/db-mappers";

// Same service-day boundary the floor route uses: close + 90 minutes
// (overnight-aware; falls back to open−60 or 4 AM when hours are unset).
// Anyone still WAITING past that boundary didn't get seated — they
// walked out. The sweep runs lazily on read, so no cron is needed and
// the queue is always clean by the time anyone looks at it.
function latestServiceResetBoundary(now: Date, openMinutes: number | null, closeMinutes: number | null): Date {
  let resetMin: number;
  if (closeMinutes == null) {
    resetMin = openMinutes == null ? 4 * 60 : (openMinutes - 60 + 1440) % 1440;
  } else {
    const overnight = openMinutes != null && closeMinutes <= openMinutes;
    resetMin = ((closeMinutes + (overnight ? 1440 : 0)) + 90) % 1440;
  }
  const tick = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(resetMin / 60), resetMin % 60);
  if (tick.getTime() > now.getTime()) tick.setDate(tick.getDate() - 1);
  return tick;
}

// ── GET: the live queue ───────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    // Lazy stale-entry sweep: mark anyone who arrived before the latest
    // close+90 boundary and never got seated as LEFT (walked out).
    // leftTime is stamped at the boundary itself — the truthful "gone by"
    // moment — and LEFT rows keep feeding the predictor's wait-tolerance
    // signal, exactly like a manual walk-away.
    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    const boundary = latestServiceResetBoundary(new Date(), settings?.openMinutes ?? null, settings?.closeMinutes ?? null);
    await prisma.waitlistEntry.updateMany({
      where: { restaurantId, status: { in: ["WAITING", "NOTIFIED"] }, arrivalTime: { lt: boundary } },
      data: { status: "LEFT", leftTime: boundary },
    });

    const rows = await prisma.waitlistEntry.findMany({
      where: { restaurantId, status: "WAITING" },
      orderBy: { arrivalTime: "asc" },
    });
    return Response.json({ waitlist: rows.map(waitlistToApp) });
  } catch (err) {
    console.error("[api/waitlist GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

// ── POST: add a party (walk-in, or a reservation moved to the queue) ──
export async function POST(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const date = todayKey();
    const created = await prisma.waitlistEntry.create({
      data: {
        restaurantId,
        ...(body.id ? { id: String(body.id) } : {}),
        name: String(body.name || "Walk-In"),
        partySize: Math.max(1, Number(body.size) || 1),
        source: body.type === "reservation" ? "MESAOS" : "WALK_IN",
        arrivalTime: body.addedAt ? new Date(Number(body.addedAt)) : new Date(),
        serviceDate: serviceDateOf(date),
        dayOfWeek: dayOfWeekOf(date),
      },
    });
    return Response.json({ entry: waitlistToApp(created) }, { status: 201 });
  } catch (err) {
    console.error("[api/waitlist POST]", err);
    return Response.json({ error: "create_failed" }, { status: 500 });
  }
}

// ── PATCH: edits and seating (unknown id = 200 no-op, see reservations) ─
export async function PATCH(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const id = String(body.id || "");
    const existing = await prisma.waitlistEntry.findFirst({ where: { id, restaurantId } });
    if (!existing) return Response.json({ ok: false, reason: "not_found" });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.size !== undefined) data.partySize = Math.max(1, Number(body.size) || 1);

    if (body.status === "seated") {
      const now = new Date();
      data.status = "SEATED";
      data.seatedTime = now;
      data.actualWaitMinutes = Math.max(
        0,
        Math.round((now.getTime() - existing.arrivalTime.getTime()) / 60000)
      );
    }

    if (Object.keys(data).length > 0) {
      await prisma.waitlistEntry.updateMany({ where: { id, restaurantId }, data });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/waitlist PATCH]", err);
    return Response.json({ error: "update_failed" }, { status: 500 });
  }
}

// ── DELETE: soft — the party LEFT ─────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || new URL(req.url).searchParams.get("id") || "");
    await prisma.waitlistEntry.updateMany({
      where: { id, restaurantId, status: "WAITING" },
      data: { status: "LEFT", leftTime: new Date() },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/waitlist DELETE]", err);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
