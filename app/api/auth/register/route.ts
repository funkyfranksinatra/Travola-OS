import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

const scrypt = promisify(scryptCallback);
function nameKey(name: unknown) { return String(name ?? "").trim().toLowerCase(); }
async function hash(passcode: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(passcode, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const key = nameKey(name);
    const passcode = String(body.passcode ?? "");
    const recoveryEmail = String(body.recoveryEmail ?? "").trim() || null;
    if (!name || !/^\d{4}$/.test(passcode)) return Response.json({ error: "invalid_registration" }, { status: 400 });
    const restaurant = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({ data: { name, nameKey: key, passcodeHash: await hash(passcode), recoveryEmail } });
      await tx.restaurantSettings.create({ data: { id: created.id, restaurantId: created.id, prefs: {
        location: { name: created.name, lat: "", lon: "", address: "" },
        onboarding: { stage: "path", done: false },
        importAccuracyBannerSeen: false,
        tours: { manager: {}, host: {} },
      } } });
      // Floor IDs are global. The restaurant's CUID gives its first floor
      // the same collision-free identity without adding another dependency.
      await tx.floor.create({ data: { id: `f-${created.id}`, name: "Main Floor", sortOrder: 0, active: true, restaurantId: created.id } });
      // TODO: recovery email delivery
      return created;
    });
    return setSession(NextResponse.json({ ok: true, restaurant: { id: restaurant.id, name: restaurant.name } }, { status: 201 }), restaurant.id, true);
  } catch (error: any) {
    if (error?.code === "P2002") return Response.json({ error: "restaurant_exists" }, { status: 409 });
    return Response.json({ error: "registration_failed" }, { status: 400 });
  }
}
