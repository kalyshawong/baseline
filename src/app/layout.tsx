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
  // iOS auto-zooms onto any focused input with font-size <16px and the zoom
  // sticks after the keyboard closes ("app zooms in and cannot zoom out",
  // 2026-08-20). maximumScale pins it. Trade-off: also disables pinch-zoom
  // in the native shell — acceptable for an app-shaped UI.
  maximumScale: 1,
  userScalable: false,
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
        <DayRollover buildSha={process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"} />
        <div className="hidden md:block">
          <Nav />
        </div>
        {children}
        <MobileTabBar />
      </body>
    </html>
  );
}
