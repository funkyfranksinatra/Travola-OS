import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

const scrypt = promisify(scryptCallback);
const attempts = new Map<string, { count: number; resetAt: number }>();

function nameKey(name: unknown) { return String(name ?? "").trim().toLowerCase(); }
function ip(req: Request) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"; }
function allow(req: Request) {
  const key = ip(req), now = Date.now(), row = attempts.get(key);
  if (!row || row.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  if (row.count >= 10) return false;
  row.count += 1;
  return true;
}
async function verify(passcode: string, stored: string) {
  const [algorithm, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const actual = await scrypt(passcode, salt, 64) as Buffer;
  const expected = Buffer.from(encoded, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(req: Request) {
  if (!allow(req)) return Response.json({ error: "too_many_attempts" }, { status: 429 });
  try {
    const body = await req.json();
    const key = nameKey(body.name);
    const passcode = String(body.passcode ?? "");
    if (!key || !/^\d{4}$/.test(passcode)) return Response.json({ error: "invalid_credentials" }, { status: 401 });
    const restaurant = await prisma.restaurant.findUnique({ where: { nameKey: key } });
    if (!restaurant || !(await verify(passcode, restaurant.passcodeHash))) return Response.json({ error: "invalid_credentials" }, { status: 401 });
    return setSession(NextResponse.json({ ok: true, restaurant: { id: restaurant.id, name: restaurant.name } }), restaurant.id);
  } catch (error) {
    console.error("[api/auth/login]", error);
    return Response.json({ error: "login_failed" }, { status: 400 });
  }
}
