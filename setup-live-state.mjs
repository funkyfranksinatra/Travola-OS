// setup-live-state.mjs — one-command installer for the live floor-state
// database layer. Carries the complete, correct schema EMBEDDED (no file
// placement, no anchor patching), applies it with `prisma db push`
// (no migration machinery, no advisory locks, no shadow database),
// regenerates the client, and VERIFIES against the live database that
// the columns exist. Every step prints PASS or FAIL loudly.
//
// Run from the project root (the folder with package.json), with the
// dev server STOPPED:
//
//     node setup-live-state.mjs
//
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SCHEMA = "// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n// MesaOS \u2014 schema.prisma\n// PostgreSQL \u00b7 Prisma ORM\n//\n// One lifecycle, one table: a Reservation is never moved between\n// \"future/current/past\" tables \u2014 its `status` enum and timestamp trio\n// (targetTime \u2192 seatedTime \u2192 finishedTime) ARE the lifecycle. The AI\n// predictor reads the Shift rollups (and raw Reservations) using the\n// denormalized time-series keys: serviceDate (@db.Date) + dayOfWeek.\n// \"Give me the last 12 Fridays of dinner service\" is a single\n// index-backed query: WHERE dayOfWeek = 5 AND period = DINNER\n// ORDER BY serviceDate DESC LIMIT 12.\n// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\ngenerator client {\n  provider = \"prisma-client-js\"\n}\n\n// Prisma 7: connection URLs no longer live in the schema. The CLI\n// (migrate, db push, studio) reads the URL from prisma.config.ts; the\n// runtime client receives a driver adapter in its constructor\n// (see prisma.config.ts and the client setup notes alongside it).\ndatasource db {\n  provider = \"postgresql\"\n}\n\n// \u2500\u2500\u2500 Enums \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n/// The single source of truth for where a reservation sits in its\n/// lifecycle. Future = UPCOMING. Current = SEATED. Past = FINISHED /\n/// NO_SHOW / CANCELLED. No row ever changes tables \u2014 only status.\nenum ReservationStatus {\n  UPCOMING\n  SEATED\n  FINISHED\n  NO_SHOW\n  CANCELLED\n}\n\n/// Walk-in lifecycle. SEATED entries graduate into covers on the Shift;\n/// LEFT entries feed the predictor's walk-away/wait-tolerance signal.\nenum WaitlistStatus {\n  WAITING\n  NOTIFIED\n  SEATED\n  LEFT\n}\n\nenum ShiftPeriod {\n  BRUNCH\n  LUNCH\n  DINNER\n}\n\n/// Provenance. Imported OpenTable/Resy CSV history is first-class\n/// training data \u2014 flagged, never mixed invisibly with native rows.\nenum BookingSource {\n  MESAOS\n  PHONE\n  WALK_IN\n  OPENTABLE_IMPORT\n  RESY_IMPORT\n}\n\n// \u2500\u2500\u2500 CRM \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nmodel Guest {\n  id          String   @id @default(cuid())\n  name        String\n  phone       String?  @unique\n  email       String?  @unique\n  vip         Boolean  @default(false)\n  /// Global CRM notes \u2014 allergies, seating preferences, occasions.\n  notes       String?\n  /// Denormalized counters, maintained transactionally when a\n  /// reservation reaches a terminal status. Cheap to read in the host\n  /// stand's hot path; recomputable from Reservation if ever suspect.\n  totalVisits Int      @default(0)\n  noShowCount Int      @default(0)\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  reservations    Reservation[]\n  waitlistEntries WaitlistEntry[]\n\n  @@index([vip])\n  @@index([name])\n}\n\n// \u2500\u2500\u2500 Floor & staff \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nmodel Table {\n  id       String  @id @default(cuid())\n  name     String  // \"T7\"\n  capacity Int\n  shape    String  @default(\"square\")\n  area     String  @default(\"dining\")\n  floorId  String  @default(\"f1\")\n  x        Int     @default(0)\n  y        Int     @default(0)\n  rotation Int     @default(0)\n  /// Soft delete: floors get redesigned, but historical reservations\n  /// must keep resolvable table references for the predictor.\n  active   Boolean @default(true)\n\n  // \u2500\u2500 Live per-service state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // Persisted so a reload mid-service brings the floor back exactly:\n  // who's seated where, bussing flags, and merge groups. Wiped daily at\n  // the service-reset boundary (one hour before opening), enforced\n  // LAZILY on read via liveUpdatedAt \u2014 no scheduler needed.\n  status           String    @default(\"available\")\n  party            String?\n  partySize        Int?\n  seatedAt         DateTime?\n  groupId          String?\n  assignedServerId String?\n  liveUpdatedAt    DateTime?\n\n  reservations ReservationTable[]\n\n  @@unique([floorId, name])\n  @@index([active, floorId])\n}\n\nmodel Server {\n  id       String   @id @default(cuid())\n  name     String\n  /// Floor section tint (hex) \u2014 the K-Means assigner's render color.\n  colorHex String?\n  /// Postgres text[]: [\"waiter\", \"bartender\"].\n  roles    String[]\n  /// Host-stand roster toggle \u2014 persists across reloads so the shift\n  /// board comes back the way it was left.\n  onShift  Boolean  @default(false)\n  active   Boolean  @default(true)\n  createdAt DateTime @default(now())\n\n  reservations Reservation[]\n  shifts       ShiftServer[]\n\n  @@index([active])\n}\n\n// \u2500\u2500\u2500 Reservations (the single lifecycle table) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nmodel Reservation {\n  id        String            @id @default(cuid())\n  guestId   String\n  guest     Guest             @relation(fields: [guestId], references: [id])\n  partySize Int\n  status    ReservationStatus @default(UPCOMING)\n  source    BookingSource     @default(MESAOS)\n  notes     String?\n\n  // \u2500\u2500 Lifecycle timestamps \u2500\u2500\n  /// When the booking was created (or original OpenTable/Resy booking\n  /// time for imports).\n  bookedAt     DateTime  @default(now())\n  /// The slot: when the party is due. Future rows are UPCOMING rows\n  /// whose targetTime is ahead of now \u2014 no separate table.\n  targetTime   DateTime\n  seatedTime   DateTime?\n  finishedTime DateTime?\n  cancelledAt  DateTime?\n\n  // \u2500\u2500 Time-series keys (denormalized, set from targetTime in the\n  //    business's local timezone at write time) \u2500\u2500\n  /// Date-only service day \u2014 the primary partition key for history.\n  serviceDate DateTime @db.Date\n  /// 0 = Sunday \u2026 6 = Saturday. The predictor's \"past Fridays\" key.\n  dayOfWeek   Int\n  /// finishedTime \u2212 seatedTime in minutes, materialized when the row\n  /// hits FINISHED, so turn-time aggregation never re-derives from\n  /// timestamps at query time.\n  turnMinutes Int?\n\n  // \u2500\u2500 Relations \u2500\u2500\n  serverId String?\n  server   Server? @relation(fields: [serverId], references: [id])\n  /// Many-to-many: a merged seating (\"T8 + T9\") is one reservation\n  /// occupying many tables \u2014 modeled properly, not as a joined-id\n  /// string.\n  tables   ReservationTable[]\n  shiftId  String?\n  shift    Shift?  @relation(fields: [shiftId], references: [id])\n\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  // The four hot query shapes:\n  @@index([serviceDate, status])          // \"today's board\", \"Oct 24 history\"\n  @@index([dayOfWeek, serviceDate])       // \"all past Fridays, newest first\"\n  @@index([status, targetTime])           // \"next UPCOMING arrivals\"\n  @@index([guestId, serviceDate])         // guest visit history\n}\n\n/// Join table: which physical tables a reservation occupies. One row\n/// for a normal booking, N rows for a merge. `isPrimary` marks the\n/// anchor table for display (\"T8 + T9\" renders under T8's badge).\nmodel ReservationTable {\n  reservationId String\n  tableId       String\n  isPrimary     Boolean @default(false)\n\n  reservation Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)\n  table       Table       @relation(fields: [tableId], references: [id])\n\n  @@id([reservationId, tableId])\n  @@index([tableId])\n}\n\n// \u2500\u2500\u2500 Waitlist (walk-ins) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nmodel WaitlistEntry {\n  id        String         @id @default(cuid())\n  /// Optional: casual walk-ins may never become CRM guests.\n  guestId   String?\n  guest     Guest?         @relation(fields: [guestId], references: [id])\n  /// Display name even when no Guest row exists.\n  name      String\n  partySize Int\n  status    WaitlistStatus @default(WAITING)\n  source    BookingSource  @default(WALK_IN)\n\n  arrivalTime   DateTime @default(now())\n  quotedMinutes Int?\n  /// arrivalTime + quotedMinutes, materialized for \"quote accuracy\"\n  /// training without timestamp math.\n  quotedTime    DateTime?\n  seatedTime    DateTime?\n  leftTime      DateTime?\n  /// seatedTime \u2212 arrivalTime in minutes, materialized on SEATED.\n  actualWaitMinutes Int?\n\n  serviceDate DateTime @db.Date\n  dayOfWeek   Int\n\n  shiftId String?\n  shift   Shift?  @relation(fields: [shiftId], references: [id])\n\n  @@index([serviceDate, status])\n  @@index([status, arrivalTime])\n  @@index([dayOfWeek, serviceDate])\n}\n\n// \u2500\u2500\u2500 Shift: the daily rollup the AI predictor trains on \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n/// One row per service period per day (\"Dinner on Oct 24\"). While the\n/// shift is live these numbers tick up in place (Current data); when\n/// service closes, a finalize job freezes the row (isFinalized) and it\n/// becomes an immutable training snapshot (Past data). Predicted*\n/// columns are written BEFORE service by the AI; actual* columns are\n/// the ground truth it later trains against \u2014 every finalized row is a\n/// (prediction, outcome) pair.\nmodel Shift {\n  id          String      @id @default(cuid())\n  serviceDate DateTime    @db.Date\n  period      ShiftPeriod\n  dayOfWeek   Int\n\n  // \u2500\u2500 The prediction (written pre-shift by the AI predictor) \u2500\u2500\n  predictedCovers  Int?\n  predictedServers Int?\n\n  // \u2500\u2500 The outcome (live counters \u2192 frozen at finalize) \u2500\u2500\n  actualCovers      Int    @default(0)\n  totalReservations Int    @default(0)\n  totalWalkIns      Int    @default(0)\n  noShows           Int    @default(0)\n  cancellations     Int    @default(0)\n  waitlistWalkAways Int    @default(0)\n  avgTurnMinutes    Float?\n  avgWaitMinutes    Float?\n  peakOccupancyPct  Float?\n  serversActual     Int?\n\n  /// Optional exogenous features for the model (weather, local events,\n  /// holidays) \u2014 schemaless on purpose; the feature set will evolve\n  /// faster than migrations should.\n  features Json?\n\n  /// Frozen snapshot flag. Finalized rows are the training set;\n  /// unfinalized rows are the live board.\n  isFinalized Boolean  @default(false)\n  finalizedAt DateTime?\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  reservations    Reservation[]\n  waitlistEntries WaitlistEntry[]\n  servers         ShiftServer[]\n\n  @@unique([serviceDate, period])\n  @@index([dayOfWeek, period, serviceDate]) // \"past Fridays' dinners, newest first\"\n  @@index([isFinalized, serviceDate])       // training-set scans\n}\n\n/// Many-to-many with payload: which servers actually worked a shift and\n/// what they handled \u2014 the ground truth the K-Means assigner and the\n/// staffing predictor are scored against.\nmodel ShiftServer {\n  shiftId      String\n  serverId     String\n  coversServed Int    @default(0)\n  tablesWorked Int    @default(0)\n\n  shift  Shift  @relation(fields: [shiftId], references: [id], onDelete: Cascade)\n  server Server @relation(fields: [serverId], references: [id])\n\n  @@id([shiftId, serverId])\n  @@index([serverId])\n}\n\n// \u2500\u2500\u2500 Floor & configuration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n/// Floors are layout containers (\"Main Floor\", \"Patio\"). Relation-free\n/// by design: Table.floorId is a plain string, so adding this model to\n/// an existing database needs no backfill. Soft-deleted like tables.\nmodel Floor {\n  id           String  @id\n  name         String\n  isManualOnly Boolean @default(false)\n  sortOrder    Int     @default(0)\n  active       Boolean @default(true)\n}\n\n/// Singleton (id \"main\"). Typed columns only for values other systems\n/// consume (the Timeline reads hours; role chips read roles); the\n/// host-stand preference pile (24h clock, sound alerts, turn-time\n/// defaults, ...) lives in `prefs` Json so new toggles never require a\n/// migration \u2014 same rationale as Shift.features.\nmodel RestaurantSettings {\n  id           String   @id @default(\"main\")\n  openMinutes  Int?\n  closeMinutes Int?\n  roles        String[] @default([\"waiter\", \"bartender\"])\n  prefs        Json?\n  updatedAt    DateTime @updatedAt\n}\n";

function step(name, fn) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    const out = fn();
    console.log(`PASS: ${name}${out ? " — " + out : ""}`);
    return true;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    console.error(String(e && e.message ? e.message : e));
    return false;
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true, // Windows: resolves npx.cmd
    env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
}

// ── 0. Right directory? ──────────────────────────────────────────────
if (!existsSync("package.json") || !existsSync("prisma")) {
  console.error("FAIL: run this from the project root (the folder containing package.json and prisma).");
  process.exit(1);
}

// ── 1. Write the embedded schema (backup first) ──────────────────────
const okSchema = step("write schema.prisma (embedded, with backup)", () => {
  const p = "prisma/schema.prisma";
  if (existsSync(p)) {
    const bak = `prisma/schema.prisma.bak-${Date.now()}`;
    copyFileSync(p, bak);
    console.log(`  backup: ${bak}`);
  }
  writeFileSync(p, SCHEMA);
  const n = (readFileSync(p, "utf8").match(/liveUpdatedAt|seatedAt|assignedServerId/g) || []).length;
  if (n < 3) throw new Error("embedded schema wrote but live-state fields not found — report this");
  return `${n} live-state field references on disk`;
});
if (!okSchema) process.exit(1);

// ── 2. Apply to the database (db push: no locks, no shadow DB) ───────
if (!step("prisma db push (applies missing columns to Neon)", () => run("npx", ["prisma", "db", "push"]))) process.exit(1);

// ── 3. Regenerate the client ─────────────────────────────────────────
if (!step("prisma generate", () => run("npx", ["prisma", "generate"]))) process.exit(1);

// ── 4. VERIFY against the live database ──────────────────────────────
const okVerify = await (async () => {
  process.stdout.write("\n=== verify columns exist in Neon ===\n");
  try {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    await import("dotenv/config");
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    const rows = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Table' AND column_name IN
        ('status','party','partySize','seatedAt','groupId','assignedServerId','liveUpdatedAt')`;
    await prisma.$disconnect();
    const found = rows.map((r) => r.column_name).sort();
    console.log("  columns found:", found.join(", ") || "(none)");
    if (found.length === 7) { console.log("PASS: all 7 live-state columns exist in the database"); return true; }
    throw new Error(`only ${found.length}/7 columns present`);
  } catch (e) {
    console.error("FAIL: verification query");
    console.error(String(e && e.message ? e.message : e));
    return false;
  }
})();

console.log("\n──────────────────────────────────────────");
if (okVerify) {
  console.log("ALL GREEN. Now run:  npm run dev");
  console.log("The amber banner should be gone; seat/merge/bussing will persist across reloads.");
} else {
  console.log("Something failed above — copy this terminal output into the chat verbatim.");
  process.exit(1);
}
