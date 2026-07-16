// app/api/floor/reset/route.ts — manual live-floor reset.
//
// Escape hatch for corrupted live state: clears every table's live
// fields and finishes any lingering SEATED reservations so they leave
// "Now Seated" and land in history. Layout (tables, positions, floors)
// is untouched. Fixes tables stuck from a mid-edit reload and seated
// parties orphaned before the close-out hook existed.
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const now = new Date();
    const seated = await prisma.reservation.findMany({
      where: { status: "SEATED" },
      select: { id: true, seatedTime: true },
    });
    await prisma.$transaction(
      seated.map((r) =>
        prisma.reservation.update({
          where: { id: r.id },
          data: {
            status: "FINISHED",
            finishedTime: now,
            turnMinutes: r.seatedTime
              ? Math.max(1, Math.round((now.getTime() - r.seatedTime.getTime()) / 60000))
              : null,
          },
        })
      )
    );
    await prisma.table.updateMany({
      data: {
        status: "available",
        party: null,
        partySize: null,
        seatedAt: null,
        groupId: null,
        liveUpdatedAt: now,
      },
    });
    return Response.json({ ok: true, finished: seated.length });
  } catch (err) {
    console.error("[api/floor/reset POST]", err);
    return Response.json({ error: "reset_failed" }, { status: 500 });
  }
}