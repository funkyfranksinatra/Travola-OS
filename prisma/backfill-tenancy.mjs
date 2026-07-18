import "dotenv/config";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const tenantTables = ["Guest", "Table", "Server", "Reservation", "WaitlistEntry", "Shift", "ShiftServer", "Floor", "ServiceDayStaff"];
const toursDone = {
  manager: { calendar: true, predictor: true, service: true, timeline: true, floor: true },
  host: { calendar: true, predictor: true, service: true, timeline: true, waitlist: true, floor: true },
};

async function hashPasscode(passcode) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(passcode, salt, 64);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

async function main() {
  const existing = await prisma.restaurant.findUnique({ where: { nameKey: "volario's" } });
  const volarios = existing ?? await prisma.restaurant.create({
    data: { name: "Volario's", nameKey: "volario's", passcodeHash: await hashPasscode("1412") },
  });
  for (const table of tenantTables) {
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "restaurantId" = $1 WHERE "restaurantId" IS NULL`, volarios.id);
  }
  const settings = await prisma.restaurantSettings.findUnique({ where: { id: "main" } });
  if (!settings) throw new Error('The expected legacy settings row "main" is missing.');
  const prefs = settings.prefs && typeof settings.prefs === "object" && !Array.isArray(settings.prefs) ? settings.prefs : {};
  await prisma.restaurantSettings.update({ where: { id: "main" }, data: { restaurantId: volarios.id, prefs: { ...prefs, tours: toursDone } } });
  const missing = [];
  for (const table of [...tenantTables, "RestaurantSettings"]) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE "restaurantId" IS NULL`);
    if (row.count) missing.push(`${table}:${row.count}`);
  }
  if (missing.length) throw new Error(`Backfill incomplete: ${missing.join(", ")}`);
  console.log(`Backfill complete for ${volarios.name} (${volarios.id}).`);
}

main().finally(() => prisma.$disconnect());
