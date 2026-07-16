// app/api/service-log/route.ts — the day's service journal + close-out.
//
// GET: everything the Service tab, right rail, and header counter need —
//   covers rollup, parties seated right now, and today's history
//   (finished with turn times, no-shows, cancellations, walk-aways).
//   All of it is a QUERY over rows the app already writes; the
//   single-lifecycle schema pays off here.
//
// POST: the close-out hook. Clearing a table calls this to stamp
//   finishedTime + turnMinutes on today's SEATED reservation — by id
//   when the session still holds it, by name + closest-seated-time
//   match after a reload. This is also the first brick of the nightly
//   Shift-actuals feed for the AI predictor.
import { prisma } from "@/lib/prisma";
import { dbTablesToAppTableId, serviceDateOf, todayKey, toTimeStr } from "@/lib/db-mappers";

const originOf = (source: string) => (source === "WALK_IN" ? "walk-in" : "reservation");

// ── GET: the viewed day's journal (?date=YYYY-MM-DD, default today) ──
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    const dateKey = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey();
    const today = serviceDateOf(dateKey);

    const [seatedRes, doneRes, walkedAway] = await Promise.all([
      prisma.reservation.findMany({
        where: { serviceDate: today, status: "SEATED" },
        include: { guest: true, tables: true },
        orderBy: { seatedTime: "desc" },
      }),
      prisma.reservation.findMany({
        where: { serviceDate: today, status: { in: ["FINISHED", "NO_SHOW", "CANCELLED"] } },
        include: { guest: true, tables: true },
      }),
      prisma.waitlistEntry.findMany({
        where: { serviceDate: today, status: "LEFT" },
      }),
    ]);

    const seated = seatedRes.map((r) => ({
      id: r.id,
      name: r.guest.name,
      size: r.partySize,
      origin: originOf(r.source),
      seatedAt: r.seatedTime ? r.seatedTime.getTime() : null,
      tableId: dbTablesToAppTableId(r.tables),
    }));

    const history = [
      ...doneRes.map((r) => {
        const event =
          r.status === "FINISHED" ? "finished" : r.status === "NO_SHOW" ? "no_show" : "cancelled";
        const at =
          (r.status === "FINISHED" ? r.finishedTime : r.cancelledAt) ?? r.targetTime;
        return {
          id: r.id,
          name: r.guest.name,
          size: r.partySize,
          origin: originOf(r.source),
          event,
          at: at.getTime(),
          time: toTimeStr(r.targetTime),
          turnMinutes: r.turnMinutes,
          tableId: dbTablesToAppTableId(r.tables),
        };
      }),
      ...walkedAway.map((w) => ({
        id: w.id,
        name: w.name,
        size: w.partySize,
        origin: "walk-in" as const,
        event: "walked" as const,
        at: (w.leftTime ?? w.arrivalTime).getTime(),
        time: toTimeStr(w.arrivalTime),
        waitedMinutes:
          w.leftTime != null
            ? Math.max(0, Math.round((w.leftTime.getTime() - w.arrivalTime.getTime()) / 60000))
            : null,
      })),
    ].sort((a, b) => b.at - a.at);

    // Covers = everyone who actually sat today (seated now + finished).
    const counted = [...seatedRes, ...doneRes.filter((r) => r.status === "FINISHED")];
    const total = counted.reduce((s, r) => s + r.partySize, 0);
    const walkIns = counted
      .filter((r) => r.source === "WALK_IN")
      .reduce((s, r) => s + r.partySize, 0);
    const turns = doneRes.filter((r) => r.status === "FINISHED" && r.turnMinutes != null);
    const avgTurn = turns.length
      ? Math.round(turns.reduce((s, r) => s + (r.turnMinutes as number), 0) / turns.length)
      : null;

    return Response.json({
      covers: {
        total,
        reservations: total - walkIns,
        walkIns,
        seatedNow: seatedRes.reduce((s, r) => s + r.partySize, 0),
        finishedParties: turns.length,
        avgTurn,
      },
      seated,
      history,
    });
  } catch (err) {
    console.error("[api/service-log GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

// ── POST: close out a seated party (table cleared) ───────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const today = serviceDateOf(todayKey());
    let target: { id: string; seatedTime: Date | null } | null = null;

    if (body.partyId) {
      const byId = await prisma.reservation.findUnique({
        where: { id: String(body.partyId) },
        select: { id: true, seatedTime: true, status: true },
      });
      if (byId && byId.status === "SEATED") target = byId;
    }

    if (!target && body.name) {
      // Post-reload fallback: today's SEATED rows for this guest name,
      // closest seated-time to the table's remembered timestamp.
      const candidates = await prisma.reservation.findMany({
        where: { serviceDate: today, status: "SEATED", guest: { name: String(body.name) } },
        select: { id: true, seatedTime: true },
      });
      if (candidates.length > 0) {
        const ref = body.seatedAtMs != null ? Number(body.seatedAtMs) : null;
        target = ref == null
          ? candidates[0]
          : candidates.reduce((best, c) => {
              const d = (x: { seatedTime: Date | null }) =>
                x.seatedTime ? Math.abs(x.seatedTime.getTime() - ref) : Number.MAX_SAFE_INTEGER;
              return d(c) < d(best) ? c : best;
            });
      }
    }

    if (!target) return Response.json({ ok: false, reason: "no_seated_match" });

    const now = new Date();
    const turnMinutes = target.seatedTime
      ? Math.max(1, Math.round((now.getTime() - target.seatedTime.getTime()) / 60000))
      : null;
    await prisma.reservation.update({
      where: { id: target.id },
      data: { status: "FINISHED", finishedTime: now, turnMinutes },
    });
    return Response.json({ ok: true, finished: target.id, turnMinutes });
  } catch (err) {
    console.error("[api/service-log POST]", err);
    return Response.json({ error: "finish_failed" }, { status: 500 });
  }
}