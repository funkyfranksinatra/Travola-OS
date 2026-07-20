// app/api/settings/route.ts — restaurant configuration (singleton "main").
// Typed columns for values other systems consume (Timeline reads hours,
// role chips read roles); everything else — 24h clock, sound alerts,
// turn-time defaults, notification toggles — rides in `prefs` Json so
// new host-stand knobs never require a migration.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const row = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      include: { restaurant: { select: { name: true } } },
    });
    if (!row) return Response.json({ settings: null });
    return Response.json({
      settings: {
        restaurantHours: { open: row.openMinutes, close: row.closeMinutes },
        restaurantName: row.restaurant.name,
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
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const hours = body.restaurantHours || {};
    const data = {
      openMinutes: hours.open ?? null,
      closeMinutes: hours.close ?? null,
      roles: Array.isArray(body.roles) ? body.roles.map(String) : [],
      prefs: body.prefs ?? {},
    };
    await prisma.restaurantSettings.upsert({
      where: { restaurantId },
      create: { id: restaurantId, restaurantId, ...data },
      update: data,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/settings PUT]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
