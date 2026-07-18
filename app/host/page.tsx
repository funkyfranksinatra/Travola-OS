// app/host/page.tsx — Travola Host: the front-of-house iPad app.
//
// Same live floor, same data, same seating flows as the manager site —
// minus everything that changes the restaurant itself. Floorplan
// editing, staff management, hours, and import/reset tools stay on the
// manager website; this surface is for running a shift: seating,
// waitlist, timeline, service log, and per-day shift roster.
//
// Installed on the iPad via Safari → Share → Add to Home Screen (see
// app/host/layout.tsx for the PWA plumbing). Touch controls — tap,
// swipe, one-finger drag to pan, pinch to zoom — live in FloorMap and
// activate on any touch device.
'use client';

import Home from '../page';

export default function HostPage() {
  return <Home hostMode />;
}
