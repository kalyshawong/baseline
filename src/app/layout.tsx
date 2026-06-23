import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Archivo } from "next/font/google";
import "./globals.css";
import "./mobile.css";
import { Nav } from "@/components/nav";
import { PwaRegister } from "@/components/pwa-register";
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
        <div className="hidden md:block">
          <Nav />
        </div>
        {children}
        <MobileTabBar />
      </body>
    </html>
  );
}
