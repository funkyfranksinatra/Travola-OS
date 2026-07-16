// prisma/seed.ts — populate the database with a realistic restaurant.
//
// Run with:  npx tsx prisma/seed.ts
//
// What it creates, and why:
//   • 14 Tables with ids "1".."14" — the SAME numerals the frontend's
//     floor uses, which is the entire table-id bridge (no lookup layer).
//   • 4 Servers matching the K-Means assigner's section colors.
//   • Guests with visit counts + VIP flags (the CRM the schema promises).
//   • Today's book: the familiar Holloway/Reyes/Costa/Lin four, so the
//     hydrated app looks exactly like the in-memory seed it replaces —
//     plus a merged 10-top tomorrow (T8+T9) to exercise the join table.
//   • The current waitlist queue (Walsh family, Bergström, Okonkwo,
//     Tanaka party).
//   • Three past Fridays of FINISHED reservations with turn times and
//     finalized Shift rollups (predicted vs actual) — real (prediction,
//     outcome) pairs, i.e. the AI predictor's training set, shaped like
//     an imported OpenTable/Resy history would be.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Date helpers (mirror lib/db-mappers.ts) ─────────────────────────
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const serviceDateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const dowOf = (key: string) => serviceDateOf(key).getUTCDay();
const at = (key: string, h: number, min: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, h, min);
};
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
/** The most recent past Friday, minus `weeksBack` further weeks. */
const pastFriday = (weeksBack: number) => {
  const d = new Date();
  const diff = (d.getDay() - 5 + 7) % 7 || 7; // at least 1 day back
  d.setDate(d.getDate() - diff - weeksBack * 7);
  return keyOf(d);
};

async function main() {
  // ── Wipe (FK-safe order) so the seed is idempotent ────────────────
  await prisma.reservationTable.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.shiftServer.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.table.deleteMany();
  await prisma.server.deleteMany();

  // ── Floor: ids match the frontend's numeric table ids ─────────────
  const TABLES: Array<[string, string, number, number, number]> = [
    // [id, name, capacity, x, y]
    ["1", "T1", 4, 60, 60], ["2", "T2", 2, 180, 60], ["3", "T3", 4, 290, 60],
    ["4", "T4", 6, 410, 60], ["5", "T5", 2, 540, 60], ["6", "T6", 8, 60, 200],
    ["7", "T7", 4, 200, 200], ["8", "T8", 4, 320, 200], ["9", "T9", 6, 440, 200],
    ["10", "T10", 2, 560, 200], ["11", "T11", 4, 60, 340], ["12", "T12", 4, 200, 340],
    ["13", "T13", 2, 320, 340], ["14", "T14", 4, 440, 340],
  ];
  await prisma.table.createMany({
    data: TABLES.map(([id, name, capacity, x, y]) => ({
      id, name, capacity, x, y, shape: "square", area: "dining", floorId: "f1",
    })),
  });

  // ── Staff ──────────────────────────────────────────────────────────
  const [priya, marcus, sofia, dre] = await Promise.all(
    (
      [
        ["Priya", "#7c83ff"],
        ["Marcus", "#4ade80"],
        ["Sofia", "#f59e0b"],
        ["Dre", "#38bdf8"],
      ] as const
    ).map(([name, colorHex]) =>
      prisma.server.create({ data: { name, colorHex, roles: ["waiter"] } })
    )
  );
  const staff = [priya, marcus, sofia, dre];

  // ── Guests (the CRM) ───────────────────────────────────────────────
  const guestDefs: Array<[string, boolean, number, string | null]> = [
    // [name, vip, totalVisits, notes]
    ["Holloway", true, 12, "Birthday regular — window seat"],
    ["Reyes", false, 3, "Anniversary this visit"],
    ["Costa", false, 1, "First time"],
    ["Lin", true, 22, "VIP — chef's counter when open"],
    ["Chen", false, 5, null],
    ["Patel", false, 9, null],
    ["Walsh", true, 24, "Large family groups"],
    ["Bergström", false, 6, null],
    ["Okonkwo", false, 4, "Often pre-orders"],
    ["Tanaka", true, 15, "Big parties — needs merges"],
  ];
  const guests: Record<string, string> = {};
  for (const [name, vip, totalVisits, notes] of guestDefs) {
    const g = await prisma.guest.create({ data: { name, vip, totalVisits, notes } });
    guests[name] = g.id;
  }

  // ── Today's book (matches the app's familiar seed) ─────────────────
  const today = keyOf(new Date());
  const upcoming: Array<{
    id: string; guest: string; size: number; h: number; min: number;
    date: string; tables: string[]; note?: string;
  }> = [
    { id: "r1", guest: "Holloway", size: 8, h: 19, min: 30, date: today, tables: ["7"], note: "Birthday" },
    { id: "r2", guest: "Reyes", size: 6, h: 19, min: 45, date: today, tables: [], note: "Anniversary" },
    { id: "r3", guest: "Costa", size: 4, h: 20, min: 0, date: today, tables: ["13"], note: "First time" },
    { id: "r4", guest: "Lin", size: 2, h: 20, min: 15, date: today, tables: [], note: "VIP" },
    // Tomorrow: a 10-top on a merged pair — exercises ReservationTable.
    { id: "r5", guest: "Tanaka", size: 10, h: 19, min: 0, date: daysFromToday(1), tables: ["8", "9"], note: "Company dinner" },
    { id: "r6", guest: "Walsh", size: 6, h: 18, min: 30, date: daysFromToday(2), tables: [] },
  ];
  for (const r of upcoming) {
    await prisma.reservation.create({
      data: {
        id: r.id,
        guestId: guests[r.guest],
        partySize: r.size,
        status: "UPCOMING",
        source: "MESAOS",
        notes: r.note ?? null,
        targetTime: at(r.date, r.h, r.min),
        serviceDate: serviceDateOf(r.date),
        dayOfWeek: dowOf(r.date),
        tables: { create: r.tables.map((tableId, i) => ({ tableId, isPrimary: i === 0 })) },
      },
    });
  }

  // ── The live waitlist queue ────────────────────────────────────────
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60000);
  await prisma.waitlistEntry.createMany({
    data: [
      { id: "a1", name: "Walsh family", partySize: 4, source: "WALK_IN", arrivalTime: minutesAgo(2), guestId: guests["Walsh"], serviceDate: serviceDateOf(today), dayOfWeek: dowOf(today) },
      { id: "a2", name: "Bergström", partySize: 2, source: "WALK_IN", arrivalTime: minutesAgo(5), guestId: guests["Bergström"], serviceDate: serviceDateOf(today), dayOfWeek: dowOf(today) },
      { id: "a3", name: "Okonkwo", partySize: 6, source: "MESAOS", arrivalTime: minutesAgo(1), guestId: guests["Okonkwo"], serviceDate: serviceDateOf(today), dayOfWeek: dowOf(today) },
      { id: "a4", name: "Tanaka party", partySize: 10, source: "WALK_IN", arrivalTime: minutesAgo(3), guestId: guests["Tanaka"], serviceDate: serviceDateOf(today), dayOfWeek: dowOf(today) },
    ],
  });

  // ── History: three past Fridays of dinner service ──────────────────
  // Each Friday: a finalized Shift (prediction + outcome) and a handful
  // of FINISHED reservations with turn times — the predictor's food.
  const guestNames = Object.keys(guests);
  for (let w = 0; w < 3; w++) {
    const key = pastFriday(w);
    const covers = 78 + w * 6; // gentle variety across weeks
    const shift = await prisma.shift.create({
      data: {
        serviceDate: serviceDateOf(key),
        period: "DINNER",
        dayOfWeek: dowOf(key),
        predictedCovers: covers - 4 + w * 3, // the AI's guess vs...
        predictedServers: 4,
        actualCovers: covers,                // ...what actually happened
        totalReservations: 14 + w,
        totalWalkIns: 9 - w,
        noShows: 1,
        cancellations: 2,
        waitlistWalkAways: w,
        avgTurnMinutes: 68 + w * 3,
        avgWaitMinutes: 14 + w * 2,
        peakOccupancyPct: 0.88 - w * 0.04,
        serversActual: 4,
        isFinalized: true,
        finalizedAt: at(key, 23, 30),
        servers: {
          create: staff.map((s, i) => ({
            serverId: s.id,
            coversServed: Math.floor(covers / 4) + (i === 0 ? covers % 4 : 0),
            tablesWorked: 3 + (i % 2),
          })),
        },
      },
    });

    for (let i = 0; i < 6; i++) {
      const seatH = 18 + Math.floor(i / 2); // 6pm, 7pm, 8pm pairs
      const seated = at(key, seatH, (i % 2) * 30);
      const turn = 55 + ((i * 13 + w * 7) % 40); // 55–95 min turns
      const tableId = String((i * 2 + w) % 14 + 1);
      await prisma.reservation.create({
        data: {
          guestId: guests[guestNames[(i + w * 2) % guestNames.length]],
          partySize: 2 + (i % 4) * 2,
          status: "FINISHED",
          source: w === 2 ? "OPENTABLE_IMPORT" : "MESAOS", // oldest week reads as imported history
          bookedAt: at(key, 10, 0),
          targetTime: seated,
          seatedTime: seated,
          finishedTime: new Date(seated.getTime() + turn * 60000),
          turnMinutes: turn,
          serviceDate: serviceDateOf(key),
          dayOfWeek: dowOf(key),
          serverId: staff[i % 4].id,
          shiftId: shift.id,
          tables: { create: [{ tableId, isPrimary: true }] },
        },
      });
    }
  }

  // Today's shift, live and unfinalized — the row tonight's service
  // will tick up in place.
  await prisma.shift.create({
    data: {
      serviceDate: serviceDateOf(today),
      period: "DINNER",
      dayOfWeek: dowOf(today),
      predictedCovers: 82,
      predictedServers: 4,
      isFinalized: false,
    },
  });

  const counts = {
    tables: await prisma.table.count(),
    servers: await prisma.server.count(),
    guests: await prisma.guest.count(),
    reservations: await prisma.reservation.count(),
    waitlist: await prisma.waitlistEntry.count(),
    shifts: await prisma.shift.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
