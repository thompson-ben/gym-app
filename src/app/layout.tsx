import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PrivateAnalytics } from "@/components/PrivateAnalytics";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "NotchLift", template: "%s · NotchLift" },
  description: "Workout planner & tracker: plan your split, log every set, and know when to add weight.",
  openGraph: { type: "website", siteName: "NotchLift", url: "/", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  applicationName: "NotchLift",
  appleWebApp: { capable: true, title: "NotchLift", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#131416" },
    { media: "(prefers-color-scheme: light)", color: "#f3f4f2" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <ServiceWorkerRegister />
        <PrivateAnalytics />
      </body>
    </html>
  );
}
