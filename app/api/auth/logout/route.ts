import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST() {
  return clearSession(NextResponse.json({ ok: true }));
}
