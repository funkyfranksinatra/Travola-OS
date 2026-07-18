import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "travola_session";
const encoder = new TextEncoder();

type Session = { restaurantId: string; iat: number; isNew?: true };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required to use restaurant sessions.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value?: string | null): Session | null {
  if (!value) return null;
  const [payload, received] = value.split(".");
  if (!payload || !received) return null;
  const expected = sign(payload);
  const a = encoder.encode(received);
  const b = encoder.encode(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.restaurantId !== "string" || typeof parsed.iat !== "number") return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

function cookieValue(req: Request) {
  const header = req.headers.get("cookie") || "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export function getRestaurantId(req: Request) {
  return decode(cookieValue(req))?.restaurantId ?? null;
}

export function isNewRestaurantSession(req: Request) {
  return decode(cookieValue(req))?.isNew === true;
}

export function setSession(response: NextResponse, restaurantId: string, isNew = false) {
  response.cookies.set(SESSION_COOKIE, encode({ restaurantId, iat: Date.now(), ...(isNew ? { isNew: true as const } : {}) }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
