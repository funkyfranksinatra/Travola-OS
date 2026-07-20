// app/api/reservations/route.ts — the reservation book's persistence API.
//
// Contract with the frontend (see lib/db-mappers.ts): requests and
// responses use the app's own shapes, so page.tsx wiring is a handful of
// fire-and-forget fetch calls, not a data-model rewrite.
//
// Lifecycle mapping (single Reservation table, status-driven):
//   frontend "on the book"     → status UPCOMING   (GET returns these)
//   frontend seats the party   → PATCH {status:'seated'} → SEATED + seatedTime
//   frontend deletes a booking → DELETE → CANCELLED + cancelledAt
// Nothing is ever hard-deleted: cancellations and no-shows are training
// data for the AI predictor (OpenTable keeps them for the same reason).
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";
import {
  buildTargetTime,
  dayOfWeekOf,
  reservationToApp,
  serviceDateOf,
  tableIdToDbIds,
  todayKey,
  toTimeStr,
  dateKeyOfService,
} from "@/lib/db-mappers";

/** Find-or-create the CRM Guest for a display name. Name isn't unique in
 *  the schema (phone/email are), so this is findFirst + create; good
 *  enough until the UI collects phone numbers. */
async function guestIdFor(restaurantId: string, name: string): Promise<string> {
  const trimmed = (name || "Guest").trim() || "Guest";
  const existing = await prisma.guest.findFirst({ where: { restaurantId, name: trimmed } });
  if (existing) return existing.id;
  const created = await prisma.guest.create({ data: { restaurantId, name: trimmed } });
  return created.id;
}

// ── GET: the active book (UPCOMING only — seated/cancelled are history) ──
export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const rows = await prisma.reservation.findMany({
      where: { restaurantId, status: { in: ["UPCOMING", "PARTIALLY_ARRIVED"] } },
      include: { guest: true, tables: true },
      orderBy: { targetTime: "asc" },
    });
    return Response.json({ reservations: rows.map(reservationToApp) });
  } catch (err) {
    console.error("[api/reservations GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

// ── POST: create a booking (client may supply its optimistic id) ──────
export async function POST(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const date: string = body.date || todayKey();
    // status:'seated' creates a walk-in COVER RECORD: the party is being
    // seated right now (performSeat), so the row is born SEATED with
    // seatedTime = now. This gives walk-ins the same lifecycle row as
    // bookings — covers, turn times, and history come from one place.
    const seatedNow = body.status === "seated";
    // No bookings in the past (cover records are exempt — they're born
    // seated right now by definition).
    if (!seatedNow && date < todayKey()) {
      return Response.json({ error: "past_date" }, { status: 400 });
    }
    const targetTime = seatedNow ? new Date() : buildTargetTime(date, body.time);
    const dbIds = tableIdToDbIds(body.tableId);
    const ownedTableIds = dbIds.length
      ? (await prisma.table.findMany({ where: { restaurantId, id: { in: dbIds } }, select: { id: true } })).map((table) => table.id)
      : [];
    if (ownedTableIds.length !== dbIds.length) return Response.json({ error: "invalid_table" }, { status: 400 });

    const created = await prisma.reservation.create({
      data: {
        ...(body.id ? { id: String(body.id) } : {}),
        restaurantId,
        guestId: await guestIdFor(restaurantId, body.name),
        partySize: Math.max(1, Number(body.size) || 1),
        notes: body.note && body.note !== "—" ? String(body.note) : null,
        vip: !!body.vip,
        status: seatedNow ? "SEATED" : "UPCOMING",
        seatedTime: seatedNow ? new Date() : null,
        targetTime,
        serviceDate: serviceDateOf(date),
        dayOfWeek: dayOfWeekOf(date),
        source: seatedNow ? "WALK_IN" : "MESAOS",
        tables: {
          create: ownedTableIds.map((tableId, i) => ({ tableId, isPrimary: i === 0 })),
        },
      },
      include: { guest: true, tables: true },
    });
    return Response.json({ reservation: reservationToApp(created) }, { status: 201 });
  } catch (err) {
    console.error("[api/reservations POST]", err);
    return Response.json({ error: "create_failed" }, { status: 500 });
  }
}

// ── PATCH: edits, table (re)assignment, and seating ───────────────────
// The frontend blind-fires PATCHes here for ids that may belong to the
// waitlist endpoint instead (updateReservation patches both arrays), so
// an unknown id is a 200 no-op, not an error.
export async function PATCH(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const id = String(body.id || "");
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) return Response.json({ ok: false, reason: "not_found" });

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.guestId = await guestIdFor(restaurantId, body.name);
    if (body.size !== undefined) data.partySize = Math.max(1, Number(body.size) || 1);
    if (body.note !== undefined) data.notes = body.note && body.note !== "—" ? String(body.note) : null;
    if (body.vip !== undefined) data.vip = !!body.vip;

    // date/time may arrive alone or together — rebuild targetTime from
    // whichever half changed plus the stored value for the other half.
    // Bookings can't be moved into the past.
    if (body.date !== undefined && String(body.date) < todayKey()) {
      return Response.json({ ok: false, reason: "past_date" }, { status: 400 });
    }

    if (body.date !== undefined || body.time !== undefined) {
      const date: string = body.date || dateKeyOfService(existing.serviceDate);
      const time: string = body.time || toTimeStr(existing.targetTime);
      data.targetTime = buildTargetTime(date, time);
      data.serviceDate = serviceDateOf(date);
      data.dayOfWeek = dayOfWeekOf(date);
    }

    if (body.status === "seated") {
      data.status = "SEATED";
      data.seatedTime = new Date();
    }
    // Partial arrival is an annotation on the wait, not a lifecycle
    // exit; 'confirmed' is the un-mark path back to plain UPCOMING.
    if (body.status === "partially_arrived") data.status = "PARTIALLY_ARRIVED";
    if (body.status === "confirmed") data.status = "UPCOMING";

    if (body.tableId !== undefined) {
      const dbIds = tableIdToDbIds(body.tableId);
      const ownedTableIds = dbIds.length
        ? (await prisma.table.findMany({ where: { restaurantId, id: { in: dbIds } }, select: { id: true } })).map((table) => table.id)
        : [];
      if (ownedTableIds.length !== dbIds.length) return Response.json({ ok: false, reason: "invalid_table" }, { status: 400 });
      await prisma.reservationTable.deleteMany({ where: { reservationId: id, reservation: { restaurantId } } });
      if (ownedTableIds.length > 0) {
        await prisma.reservationTable.createMany({
          data: ownedTableIds.map((tableId, i) => ({ reservationId: id, tableId, isPrimary: i === 0 })),
        });
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.reservation.updateMany({ where: { id, restaurantId }, data });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/reservations PATCH]", err);
    return Response.json({ error: "update_failed" }, { status: 500 });
  }
}

// ── DELETE: soft — the booking becomes CANCELLED history ──────────────
export async function DELETE(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || new URL(req.url).searchParams.get("id") || "");
    if (body.tourDemo === true) {
      // Walkthrough probes are deliberately identifiable and must not
      // remain in history or predictor training after a tour ends.
      await prisma.reservation.deleteMany({ where: { restaurantId, guest: { is: { name: "Tour Demo Party" } } } });
      return Response.json({ ok: true, tourDemo: true });
    }
    await prisma.reservation.updateMany({
      // serviceDate gate: past bookings are read-only history — even a
      // hand-crafted DELETE can't cancel them.
      where: { id, restaurantId, status: "UPCOMING", serviceDate: { gte: serviceDateOf(todayKey()) } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/reservations DELETE]", err);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
