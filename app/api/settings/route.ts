// app/api/settings/route.ts — restaurant configuration (singleton "main").
// Typed columns for values other systems consume (Timeline reads hours,
// role chips read roles); everything else — 24h clock, sound alerts,
// turn-time defaults, notification toggles — rides in `prefs` Json so
// new host-stand knobs never require a migration.
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const row = await prisma.restaurantSettings.findUnique({ where: { id: "main" } });
    if (!row) return Response.json({ settings: null });
    return Response.json({
      settings: {
        restaurantHours: { open: row.openMinutes, close: row.closeMinutes },
        roles: row.roles,
        prefs: row.prefs ?? {},
      },
    });
  } catch (err) {
    console.error("[api/settings GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const hours = body.restaurantHours || {};
    const data = {
      openMinutes: hours.open ?? null,
      closeMinutes: hours.close ?? null,
      roles: Array.isArray(body.roles) ? body.roles.map(String) : [],
      prefs: body.prefs ?? {},
    };
    await prisma.restaurantSettings.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/settings PUT]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
