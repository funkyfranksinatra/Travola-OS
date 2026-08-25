// app/api/events/route.ts — tail the ServiceEvent bus.
//
// GET /api/events?since=<seq>&types=CHECK_PAID,COURSE_BUMPED
//
// The floor client polls this (3–5s, the KDS cadence) to hear what the
// POS did — checks opened, courses fired/bumped, checks paid — without
// any push infrastructure. `since` is the last seq the client has seen
// (0 or absent = "start from now": returns the current cursor and no
// backlog, so a fresh page never replays the whole day). Same session
// auth as every other route.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";

const MAX_BATCH = 200;

export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const url = new URL(req.url);
    const sinceRaw = url.searchParams.get("since");
    const typesRaw = url.searchParams.get("types");
    const types = typesRaw ? typesRaw.split(",").map((t) => t.trim()).filter(Boolean) : null;

    // No cursor: hand back the latest seq so the client can start tailing.
    if (sinceRaw == null || sinceRaw === "" || sinceRaw === "0") {
      const latest = await prisma.serviceEvent.findFirst({
        where: { restaurantId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      return Response.json({ cursor: latest ? Number(latest.seq) : 0, events: [] });
    }

    const since = BigInt(sinceRaw);
    const rows = await prisma.serviceEvent.findMany({
      where: {
        restaurantId,
        seq: { gt: since },
        ...(types ? { type: { in: types } } : {}),
      },
      orderBy: { seq: "asc" },
      take: MAX_BATCH,
    });
    const cursor = rows.length ? Number(rows[rows.length - 1].seq) : Number(since);
    return Response.json({
      cursor,
      events: rows.map((e) => ({
        seq: Number(e.seq),
        source: e.source,
        type: e.type,
        partyKey: e.partyKey,
        tableIds: e.tableIds,
        serverId: e.serverId,
        checkId: e.checkId,
        payload: e.payload,
        at: e.createdAt.getTime(),
      })),
    });
  } catch (err) {
    console.error("[api/events GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}
