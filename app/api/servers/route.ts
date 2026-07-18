// app/api/servers/route.ts — staff roster persistence.
// App shape: { id, name, onShift, roles: string[], color: hex | null }.
// Removal is a soft delete (active: false) — historical shifts and
// reservations keep their server references for the predictor.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";

const toApp = (s: { id: string; name: string; onShift: boolean; roles: string[]; colorHex: string | null; aiExcluded?: boolean }) => ({
  id: s.id,
  name: s.name,
  onShift: s.onShift,
  roles: s.roles,
  aiExcluded: !!s.aiExcluded,
  color: s.colorHex,
});

export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const rows = await prisma.server.findMany({ where: { restaurantId, active: true }, orderBy: { createdAt: "asc" } });
    return Response.json({ servers: rows.map(toApp) });
  } catch (err) {
    console.error("[api/servers GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const created = await prisma.server.create({
      data: {
        restaurantId,
        ...(body.id ? { id: String(body.id) } : {}),
        name: String(body.name || "Staff"),
        roles: Array.isArray(body.roles) ? body.roles.map(String) : [],
        colorHex: body.color ?? null,
        onShift: !!body.onShift,
        aiExcluded: !!body.aiExcluded,
      },
    });
    return Response.json({ server: toApp(created) }, { status: 201 });
  } catch (err) {
    console.error("[api/servers POST]", err);
    return Response.json({ error: "create_failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const id = String(body.id || "");
    const existing = await prisma.server.findFirst({ where: { id, restaurantId } });
    if (!existing) return Response.json({ ok: false, reason: "not_found" });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.onShift !== undefined) data.onShift = !!body.onShift;
    if (body.color !== undefined) data.colorHex = body.color ?? null;
    if (body.roles !== undefined) data.roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
    if (body.aiExcluded !== undefined) data.aiExcluded = !!body.aiExcluded;

    if (Object.keys(data).length > 0) await prisma.server.updateMany({ where: { id, restaurantId }, data });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/servers PATCH]", err);
    return Response.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || new URL(req.url).searchParams.get("id") || "");
    await prisma.server.updateMany({ where: { id, restaurantId }, data: { active: false, onShift: false } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/servers DELETE]", err);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
