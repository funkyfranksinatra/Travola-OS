import { NextResponse, type NextRequest } from "next/server";
import { getRestaurantId } from "@/lib/session";

// The app shell is a client component, so relying on its initial API
// hydration leaves a cookie-less visit parked on "Loading floor…". Keep
// the boundary server-side and narrow: every API route still validates the
// signed session for its own reads and writes.
export function proxy(request: NextRequest) {
  if (getRestaurantId(request)) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname === "/host") login.searchParams.set("host", "1");
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/", "/host"] };
