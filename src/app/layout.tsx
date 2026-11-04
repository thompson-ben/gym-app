import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ConsentBanner } from "@/components/ConsentBanner";
import { InlineScript, LaunchIntro } from "@/components/LaunchIntro";
import { LAUNCH_INTRO_SCRIPT, LaunchIntroOverlay } from "@/components/LaunchIntroOverlay";
import { VisitTracker } from "@/components/VisitTracker";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Setmodo", template: "%s · Setmodo" },
  description: "Workout planner & tracker: plan your split, log every set, and know when to add weight.",
  openGraph: { type: "website", siteName: "Setmodo", url: "/", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  applicationName: "Setmodo",
  appleWebApp: { capable: true, title: "Setmodo", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
  // Proves to Meta that notchlift.com belongs to our business (Business Settings → Domains).
  // setmodo.com is verified with a DNS TXT record instead, so it needs nothing here.
  verification: { other: { "facebook-domain-verification": "r367upxkorg64phwguyrfz5ijpiv67" } },
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
        <LaunchIntroOverlay />
        <InlineScript html={LAUNCH_INTRO_SCRIPT} />
        <LaunchIntro />
        {children}
        <ServiceWorkerRegister />
        <VisitTracker />
        <ConsentBanner />
      </body>
    </html>
  );
}
