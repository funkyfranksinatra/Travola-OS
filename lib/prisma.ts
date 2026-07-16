// lib/prisma.ts — the one PrismaClient for the whole app.
//
// Prisma 7: the Rust query engine is gone; the client talks to Postgres
// through a driver adapter passed to the constructor. Next.js dev mode
// hot-reloads modules constantly, and a naive `new PrismaClient()` per
// reload leaks connections until the pool (or Neon's free tier) says no —
// hence the globalThis stash, the standard Next + Prisma pattern.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
