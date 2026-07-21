#!/usr/bin/env node
/**
 * One-off production maintenance utility.
 *
 * Default mode is a dry run. Re-run with --apply only after checking its
 * printed restaurant list. It deliberately has no HTTP entry point.
 *
 * Example:
 *   node --env-file=.env.local scripts/maintenance/sweep-tenants.mjs
 *   node --env-file=.env.local scripts/maintenance/sweep-tenants.mjs --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const KEEP_ID = "cmrqtf66p0000vckbqul1qj7k";
const KEEP_NAME = "Volario's";
const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Pass it through the environment; never commit it.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const keeper = await prisma.restaurant.findUnique({
    where: { id: KEEP_ID },
    select: { id: true, name: true },
  });
  if (!keeper || keeper.name !== KEEP_NAME) {
    throw new Error(`Refusing to run: expected ${KEEP_NAME} (${KEEP_ID}), found ${keeper ? `${keeper.name} (${keeper.id})` : "nothing"}.`);
  }

  const targets = await prisma.restaurant.findMany({
    where: { id: { not: KEEP_ID } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true },
  });

  console.log(`Keeping: ${keeper.name} (${keeper.id})`);
  console.log(`Restaurants to delete (${targets.length}):`);
  for (const target of targets) console.log(`- ${target.name} (${target.id}) — ${target.createdAt.toISOString()}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing this list.");
    return;
  }

  const ids = targets.map((target) => target.id);
  if (!ids.length) {
    console.log("Nothing to delete.");
    return;
  }

  const deleted = await prisma.$transaction(async (tx) => {
    // Relation rows first, then their owners. Every tenant-owned Prisma model
    // is included here; ReservationTable is scoped through its two parents.
    const reservationTables = await tx.reservationTable.deleteMany({
      where: {
        OR: [
          { reservation: { restaurantId: { in: ids } } },
          { table: { restaurantId: { in: ids } } },
        ],
      },
    });
    const reservations = await tx.reservation.deleteMany({ where: { restaurantId: { in: ids } } });
    const waitlistEntries = await tx.waitlistEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    const shiftServers = await tx.shiftServer.deleteMany({ where: { restaurantId: { in: ids } } });
    const serviceDayStaff = await tx.serviceDayStaff.deleteMany({ where: { restaurantId: { in: ids } } });
    const dailyBriefings = await tx.dailyBriefing.deleteMany({ where: { restaurantId: { in: ids } } });
    const shiftForecasts = await tx.shiftForecast.deleteMany({ where: { restaurantId: { in: ids } } });
    const forecastAccuracy = await tx.forecastAccuracy.deleteMany({ where: { restaurantId: { in: ids } } });
    const tables = await tx.table.deleteMany({ where: { restaurantId: { in: ids } } });
    const floors = await tx.floor.deleteMany({ where: { restaurantId: { in: ids } } });
    const servers = await tx.server.deleteMany({ where: { restaurantId: { in: ids } } });
    const shifts = await tx.shift.deleteMany({ where: { restaurantId: { in: ids } } });
    const guests = await tx.guest.deleteMany({ where: { restaurantId: { in: ids } } });
    const settings = await tx.restaurantSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    const restaurants = await tx.restaurant.deleteMany({ where: { id: { in: ids } } });
    return { reservationTables, reservations, waitlistEntries, shiftServers, serviceDayStaff, dailyBriefings, shiftForecasts, forecastAccuracy, tables, floors, servers, shifts, guests, settings, restaurants };
  }, { timeout: 60_000 });

  console.log("Deleted dependent rows:");
  for (const [model, result] of Object.entries(deleted)) console.log(`- ${model}: ${result.count}`);
  console.log(`Restaurants remaining: ${await prisma.restaurant.count()}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
