import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Archivo } from "next/font/google";
import "./globals.css";
import "./mobile.css";
import { Nav } from "@/components/nav";
import { PwaRegister } from "@/components/pwa-register";
import { NativeHealthInit } from "@/components/native/native-health-init";
import { TzCookie } from "@/components/tz-cookie";
import { DayRollover } from "@/components/day-rollover";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-disp",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Baseline",
  description: "Biometric-aware training intelligence",
  applicationName: "Baseline",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Baseline",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#181613",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${archivo.variable}`}>
      <body className="min-h-screen antialiased">
        <PwaRegister />
        <NativeHealthInit />
        <TzCookie />
        <DayRollover />
        <div className="hidden md:block">
          <Nav />
        </div>
        {children}
        {/* TEMPORARY diagnostic (2026-08-20): her device kept showing old UI
            after verified-live deploys. This stamp = which build + when THIS
            page was server-rendered. Old time on screen → stale client cache;
            fresh time but old visuals → asset-level cache. Remove once the
            staleness chain is closed. */}
        <div className="md:hidden" style={{ position: "fixed", bottom: 2, left: 8, zIndex: 9, fontSize: 8, letterSpacing: "0.04em", color: "rgba(255,255,255,0.28)", pointerEvents: "none", fontFamily: "monospace" }}>
          {(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)} · {new Date().toISOString().slice(11, 16)}Z
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
