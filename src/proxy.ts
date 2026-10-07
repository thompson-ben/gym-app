import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/forgot-password", "/reset-password", "/auth", "/s/", "/offline", "/privacy", "/terms", "/manifest.webmanifest", "/sw.js"];

/** Refreshes the Supabase session cookie and keeps signed-out visitors out of the app. */
export async function proxy(request: NextRequest) {
  // If an email link's redirect address isn't on Supabase's allow-list, Supabase falls back to
  // the Site URL (e.g. "/?token_hash=…"). Forward such links to the right callback instead of
  // silently dropping the token, so confirming or resetting still works.
  const params = request.nextUrl.searchParams;
  if (!request.nextUrl.pathname.startsWith("/auth/") && (params.has("token_hash") || params.has("code"))) {
    const target = request.nextUrl.clone();
    target.pathname = params.get("type") === "recovery" ? "/auth/reset" : "/auth/confirm";
    return NextResponse.redirect(target);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (!data?.claims && !isPublic) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(signIn);
  }
  // Authenticated pages must never be stored by shared caches.
  if (!isPublic) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
