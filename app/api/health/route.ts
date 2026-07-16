// app/api/health/route.ts — the app diagnoses its own deploy state.
//
// Every "not saving" incident so far has been a deploy gap (unplaced
// file, unrun migration, stale client) that took a terminal probe
// session to find. This route makes the app report those gaps itself:
// the frontend calls it on load and renders an instruction banner for
// anything missing. Checks are ordered from outermost failure inward.
import { prisma } from "@/lib/prisma";

export async function GET() {
  const report = { db: false, liveState: false, settings: false, serviceDay: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    report.db = true;
  } catch (err) {
    console.error("[api/health] db unreachable:", err);
    return Response.json(report, { status: 503 });
  }
  try {
    // Selecting liveUpdatedAt fails on BOTH failure modes: column absent
    // in the database (migration unrun) or field absent from a stale
    // generated client (generate/restart skipped).
    await prisma.table.findFirst({ select: { id: true, liveUpdatedAt: true } });
    report.liveState = true;
  } catch {
    report.liveState = false;
  }
  try {
    await prisma.restaurantSettings.findUnique({ where: { id: "main" } });
    report.settings = true;
  } catch {
    report.settings = false;
  }
  try {
    // Per-day staff table: catches the missing service_day_staff migration
    // (sections/roster assign in-memory but vanish on reload).
    await prisma.serviceDayStaff.findFirst({ select: { serviceDate: true } });
    report.serviceDay = true;
  } catch {
    report.serviceDay = false;
  }
  return Response.json(report);
}