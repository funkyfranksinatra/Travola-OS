import { prisma } from "@/lib/prisma";

// GET /api/assigner-stats — shift-history inputs for the section planner.
// perServer: each server's average covers served per recorded night —
// the planner normalizes these into section-size weights. expectedCovers:
// tonight's likely volume (same weekday first, overall fallback). All
// failures degrade to empty stats: the planner falls back to even split.
export async function GET() {
  try {
    const rows = await prisma.shiftServer.groupBy({
      by: ["serverId"],
      where: { coversServed: { gt: 0 } },
      _avg: { coversServed: true },
      _count: { serverId: true },
    });
    const perServer: Record<string, number> = {};
    let nights = 0;
    for (const r of rows) {
      if (r._avg.coversServed && r._avg.coversServed > 0) {
        perServer[r.serverId] = Math.round(r._avg.coversServed * 10) / 10;
        nights += r._count.serverId;
      }
    }
    const dow = new Date().getDay();
    const sameDay = await prisma.shift.aggregate({
      where: { actualCovers: { gt: 0 }, dayOfWeek: dow },
      _avg: { actualCovers: true },
      _count: true,
    });
    let expectedCovers: number | null =
      sameDay._count > 0 ? sameDay._avg.actualCovers : null;
    if (!expectedCovers) {
      const anyDay = await prisma.shift.aggregate({
        where: { actualCovers: { gt: 0 } },
        _avg: { actualCovers: true },
        _count: true,
      });
      expectedCovers = anyDay._count > 0 ? anyDay._avg.actualCovers : null;
    }
    return Response.json({ perServer, expectedCovers, nights });
  } catch (err) {
    console.error("[api/assigner-stats]", err);
    return Response.json({ perServer: {}, expectedCovers: null, nights: 0 });
  }
}