import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Versions the service worker per deployment (see public/sw.js).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? `local-${Date.now()}` },
  // Lets the local Supabase auth redirect (http://127.0.0.1:3000) use the dev server.
  allowedDevOrigins: ["127.0.0.1"],
  // The old notchlift.com addresses (from before the rename) go to the same page on setmodo.com.
  // Not /api/: Stripe, RevenueCat and the daily job may still call the old address, and webhooks
  // don't follow redirects. Temporary (307) for now, so a cached redirect can't outlive a mistake.
  async redirects() {
    return [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "(?:www\\.)?notchlift\\.com" }],
        destination: "https://www.setmodo.com/:path",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
