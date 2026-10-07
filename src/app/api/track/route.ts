import { NextResponse } from "next/server";
import { deviceFromUserAgent, isBot } from "@/lib/attribution";
import { supabaseAnon } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const NAMES = new Set(["visit", "signup_view"]);
const FIELDS = ["path", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "from_meta_ad"] as const;

/**
 * Anonymous analytics events. Adds device type and country (from Vercel's edge, not the IP
 * address, which is never stored). Always answers 204 so tracking can never break a page.
 */
export async function POST(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (isBot(ua)) return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json()) as { name?: string; props?: Record<string, unknown> };
    if (!body?.name || !NAMES.has(body.name)) return new NextResponse(null, { status: 204 });
    const props: Record<string, unknown> = {};
    for (const key of FIELDS) {
      const v = body.props?.[key];
      if (typeof v === "string" || typeof v === "boolean") props[key] = v;
    }
    props.device = deviceFromUserAgent(ua);
    const country = request.headers.get("x-vercel-ip-country");
    if (country) props.country = country;
    await supabaseAnon().rpc("track_event", { p_name: body.name, p_props: props });
  } catch {
    /* never fail the page */
  }
  return new NextResponse(null, { status: 204 });
}
