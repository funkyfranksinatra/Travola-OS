// app/api/import/commit-bulk/route.ts — high-volume landing for the
// AI-mapped importer.
//
// The original /api/import/commit is built for a human-reviewed batch
// (≤500 rows, per-row DB dedupe queries). An OpenTable export is 10k+
// rows, so this route does the same defenses in bulk:
//   - dedupe against the DB with ONE query over the batch's service
//     dates (natural key: serviceDate + guest name + targetTime + size)
//   - guests resolved/created in bulk (phone/email enrichment kept
//     best-effort: unique-collision fallback strips contact fields
//     rather than sinking the batch)
//   - reservations landed with createManyAndReturn, table links with a
//     single createMany
// The client chunks big files across several calls; each call is
// self-contained and idempotent thanks to the dedupe key.
import { prisma } from "@/lib/prisma";
import {
  parseResMinutes,
  buildTargetTime,
  serviceDateOf,
  dayOfWeekOf,
} from "@/lib/db-mappers";

export const maxDuration = 60;

type InRow = {
  name?: string;
  date?: string;            // YYYY-MM-DD (client guarantees, we re-check)
  time?: string | null;     // booked time "7:30 PM"
  size?: number;
  status?: string;          // finished | no_show | cancelled | seated_only | unknown
  seatedTime?: string | null;
  finishedTime?: string | null;
  turnMinutes?: number | null;
  tableId?: number | string | null;
  kind?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

const SOURCE_MAP: Record<string, "OPENTABLE_IMPORT" | "RESY_IMPORT" | "PAPER_IMPORT"> = {
  opentable: "OPENTABLE_IMPORT",
  resy: "RESY_IMPORT",
  paper: "PAPER_IMPORT",
  other: "PAPER_IMPORT",
};

const STATUS_MAP: Record<string, "FINISHED" | "NO_SHOW" | "CANCELLED"> = {
  finished: "FINISHED",
  no_show: "NO_SHOW",
  cancelled: "CANCELLED",
  seated_only: "FINISHED",
  unknown: "FINISHED",
};

function timeOnDate(dateKey: string, raw?: string | null): Date | null {
  const min = parseResMinutes(raw ?? "");
  if (min == null) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: InRow[] = Array.isArray(body.rows) ? body.rows : [];
    const source = SOURCE_MAP[String(body.source || "other").toLowerCase()] ?? "PAPER_IMPORT";
    if (rows.length === 0) return Response.json({ error: "no_rows" }, { status: 400 });
    if (rows.length > 4000) return Response.json({ error: "too_many_rows", max: 4000 }, { status: 400 });

    // ── Normalize + validate in memory ─────────────────────────────
    type Prepared = {
      name: string; dateKey: string; size: number;
      status: "FINISHED" | "NO_SHOW" | "CANCELLED";
      targetTime: Date; seatedTime: Date | null; finishedTime: Date | null;
      turnMinutes: number | null; tableDbIds: string[];
      phone: string | null; email: string | null; notes: string | null;
      key: string;
    };
    const prepared: Prepared[] = [];
    const errors: Array<{ index: number; reason: string }> = [];
    let duplicates = 0;

    const batchKeys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r.name || "").trim();
      const dateKey = String(r.date || "");
      const size = Math.max(1, Number(r.size) || 0);
      if (!name) { errors.push({ index: i, reason: "missing_name" }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { errors.push({ index: i, reason: "missing_or_bad_date" }); continue; }
      if (!Number(r.size)) { errors.push({ index: i, reason: "missing_size" }); continue; }

      const status = STATUS_MAP[String(r.status || "unknown")] ?? "FINISHED";
      const bookedRaw = r.time || r.seatedTime || null;
      const targetTime = bookedRaw ? buildTargetTime(dateKey, bookedRaw) : buildTargetTime(dateKey, "12:00pm");
      const seatedTime = timeOnDate(dateKey, r.seatedTime);
      let finishedTime = timeOnDate(dateKey, r.finishedTime);
      if (seatedTime && finishedTime && finishedTime < seatedTime) {
        finishedTime = new Date(finishedTime.getTime() + 24 * 60 * 60 * 1000);
      }
      let turnMinutes: number | null =
        r.turnMinutes != null && Number.isFinite(Number(r.turnMinutes)) && Number(r.turnMinutes) > 0
          ? Math.round(Number(r.turnMinutes))
          : null;
      if (turnMinutes == null && seatedTime && finishedTime) {
        turnMinutes = Math.max(1, Math.round((finishedTime.getTime() - seatedTime.getTime()) / 60000));
      }

      const key = `${dateKey}|${name.toLowerCase()}|${targetTime.getTime()}|${size}`;
      if (batchKeys.has(key)) { duplicates++; continue; }
      batchKeys.add(key);

      prepared.push({
        name, dateKey, size, status, targetTime, seatedTime, finishedTime, turnMinutes,
        tableDbIds: r.tableId != null && r.tableId !== "" ? String(r.tableId).split("_").map(String) : [],
        phone: r.phone ? String(r.phone).trim() || null : null,
        email: r.email ? String(r.email).trim().toLowerCase() || null : null,
        notes: r.notes ? String(r.notes).slice(0, 1000) : null,
        key,
      });
    }

    if (prepared.length === 0) {
      return Response.json({ ok: true, created: 0, duplicates, errors });
    }

    // ── Bulk dedupe against the DB: one query over the batch's dates ──
    const dateKeys = Array.from(new Set(prepared.map((p) => p.dateKey)));
    const existing = await prisma.reservation.findMany({
      where: { serviceDate: { in: dateKeys.map(serviceDateOf) } },
      select: { partySize: true, targetTime: true, serviceDate: true, guest: { select: { name: true } } },
    });
    const existingKeys = new Set(
      existing.map((e) => {
        const d = e.serviceDate.toISOString().slice(0, 10);
        return `${d}|${e.guest.name.toLowerCase()}|${e.targetTime.getTime()}|${e.partySize}`;
      })
    );
    const fresh = prepared.filter((p) => !existingKeys.has(p.key));
    duplicates += prepared.length - fresh.length;

    if (fresh.length === 0) {
      return Response.json({ ok: true, created: 0, duplicates, errors });
    }

    // ── Guests in bulk ───────────────────────────────────────────────
    const wantedNames = Array.from(new Set(fresh.map((p) => p.name)));
    const known = await prisma.guest.findMany({
      where: { name: { in: wantedNames } },
      select: { id: true, name: true },
    });
    const guestIdByName = new Map(known.map((g) => [g.name.toLowerCase(), g.id]));

    const missing = wantedNames.filter((n) => !guestIdByName.has(n.toLowerCase()));
    if (missing.length > 0) {
      // First occurrence of contact info wins; strip phones/emails that
      // repeat inside the batch or already exist (unique columns).
      const contact = new Map<string, { phone: string | null; email: string | null }>();
      const seenPhone = new Set<string>();
      const seenEmail = new Set<string>();
      for (const p of fresh) {
        const k = p.name.toLowerCase();
        if (contact.has(k)) continue;
        const phone = p.phone && !seenPhone.has(p.phone) ? p.phone : null;
        const email = p.email && !seenEmail.has(p.email) ? p.email : null;
        if (phone) seenPhone.add(phone);
        if (email) seenEmail.add(email);
        contact.set(k, { phone, email });
      }
      const rowsToCreate = missing.map((n) => ({
        name: n,
        phone: contact.get(n.toLowerCase())?.phone ?? null,
        email: contact.get(n.toLowerCase())?.email ?? null,
      }));
      try {
        await prisma.guest.createMany({ data: rowsToCreate });
      } catch {
        // Unique collision on phone/email somewhere in the batch —
        // land the guests without contact enrichment rather than fail.
        await prisma.guest.createMany({
          data: missing.map((n) => ({ name: n })),
          skipDuplicates: true,
        });
      }
      const created = await prisma.guest.findMany({
        where: { name: { in: missing } },
        select: { id: true, name: true },
      });
      for (const g of created) guestIdByName.set(g.name.toLowerCase(), g.id);
    }

    // ── Reservations + table links ───────────────────────────────────
    const landable = fresh.filter((p) => guestIdByName.has(p.name.toLowerCase()));
    const validTableIds = new Set(
      (await prisma.table.findMany({ select: { id: true } })).map((t) => t.id)
    );

    const createdRes = await prisma.reservation.createManyAndReturn({
      data: landable.map((p) => ({
        guestId: guestIdByName.get(p.name.toLowerCase())!,
        partySize: p.size,
        status: p.status,
        source,
        bookedAt: p.targetTime,
        targetTime: p.targetTime,
        seatedTime: p.seatedTime ?? undefined,
        finishedTime: p.finishedTime ?? undefined,
        serviceDate: serviceDateOf(p.dateKey),
        dayOfWeek: dayOfWeekOf(p.dateKey),
        turnMinutes: p.turnMinutes ?? undefined,
        notes: p.notes ?? undefined,
      })),
      select: { id: true },
    });

    const links: Array<{ reservationId: string; tableId: string; isPrimary: boolean }> = [];
    createdRes.forEach((res, i) => {
      const ids = landable[i].tableDbIds.filter((tid) => validTableIds.has(tid));
      ids.forEach((tid, idx) => links.push({ reservationId: res.id, tableId: tid, isPrimary: idx === 0 }));
    });
    if (links.length > 0) {
      await prisma.reservationTable.createMany({ data: links, skipDuplicates: true });
    }

    return Response.json({
      ok: true,
      created: createdRes.length,
      duplicates,
      errors,
      tableLinks: links.length,
    });
  } catch (error) {
    console.error("[api/import/commit-bulk]", error);
    return Response.json({ error: "commit_failed" }, { status: 500 });
  }
}
