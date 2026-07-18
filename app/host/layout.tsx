// app/host/layout.tsx — PWA plumbing for the iPad host app.
//
// This is what makes Safari's Share → "Add to Home Screen" install
// /host as a real app: its own icon, its own name, full-screen with no
// browser chrome (display: standalone via /host.webmanifest, plus the
// legacy apple-mobile-web-app meta tags iOS still honors). The viewport
// pins page zoom OFF so the only pinch that means anything is the floor
// map's own pinch-to-zoom gesture.
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Travola Host",
  description: "Front-of-house host stand: live floor, seating, waitlist, and service log.",
  manifest: "/host.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Travola Host",
  },
  icons: {
    apple: "/icons/host-180.png",
    icon: "/icons/host-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#161619",
};

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
