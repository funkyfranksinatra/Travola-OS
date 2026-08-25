// app/api/service-day/route.ts — per-service-day staff + sections.
//
// The roster (who's on shift) and section map (tableId → serverId) are
// per-day records, not global live state, so today's staffing never
// bleeds into future/past views. GET returns the viewed day's record
// (empty default if untouched); PUT saves it. Past days are immutable
// history (the client enforces read-only; this route 409s a past write
// as defense in depth). Also the predictor's per-shift section feed.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";
import { serviceDateOf, todayKey } from "@/lib/db-mappers";
import { invalidateShiftIntel } from "@/lib/shift-intel";
import { emitServiceEvents } from "@/lib/service-events";

const dateParam = (req: Request) => {
  const raw = new URL(req.url).searchParams.get("date");
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey();
};

// ── GET: the viewed day's roster + sections (empty default) ──────────
export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const dateKey = dateParam(req);
    const row = await prisma.serviceDayStaff.findUnique({
      where: { restaurantId_serviceDate: { restaurantId, serviceDate: serviceDateOf(dateKey) } },
    });
    return Response.json({
      date: dateKey,
      roster: row?.roster ?? [],
      sections: (row?.sections as Record<string, string> | null) ?? {},
      exists: !!row,
    });
  } catch (err) {
    console.error("[api/service-day GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

// ── PUT: save the viewed day's roster + sections ─────────────────────
export async function PUT(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const dateKey = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : todayKey();

    // Past days are immutable — refuse writes older than today.
    if (dateKey < todayKey()) {
      return Response.json({ ok: false, reason: "past_readonly" }, { status: 409 });
    }

    const roster: string[] = Array.isArray(body.roster) ? body.roster.map(String) : [];
    const sections =
      body.sections && typeof body.sections === "object" ? body.sections : {};

    await prisma.serviceDayStaff.upsert({
      where: { restaurantId_serviceDate: { restaurantId, serviceDate: serviceDateOf(dateKey) } },
      create: { restaurantId, serviceDate: serviceDateOf(dateKey), roster, sections },
      update: { roster, sections },
    });
    invalidateShiftIntel(restaurantId, dateKey);
    // Shared-DB link: broadcast tonight's sections so the POS floor view
    // (server ownership, "my tables") refreshes without a reload.
    if (dateKey === todayKey()) {
      await emitServiceEvents(restaurantId, [{
        source: "os",
        type: "SECTIONS_ASSIGNED",
        tableIds: Object.keys(sections as Record<string, string>),
        payload: { date: dateKey, roster, sections },
      }]);
    }
    return Response.json({ ok: true, date: dateKey });
  } catch (err) {
    console.error("[api/service-day PUT]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
