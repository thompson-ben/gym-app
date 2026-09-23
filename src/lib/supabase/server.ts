import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabaseEnv } from "./env";

export async function supabaseServer() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user (verified with Supabase Auth), or a redirect to sign in. */
export const requireUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/sign-in");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
});

export const getOptionalUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
});

/** The viewer's time zone (set by the client in a cookie), used for server-rendered dates. */
export async function viewerTimeZone(): Promise<string> {
  const tz = (await cookies()).get("sm_tz")?.value;
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: tz });
      return tz;
    } catch {
      /* invalid zone */
    }
  }
  return "UTC";
}
