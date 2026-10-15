"use client";

import { useEffect } from "react";
import { decodeTouch } from "@/lib/attribution";
import { NEW_OAUTH_COOKIE } from "@/lib/auth-providers";
import { pixelEvent } from "@/lib/pixel";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearTouchCookie, getTouchCookie } from "@/lib/track";

/**
 * After sign-in, attaches the campaign that first brought this browser to the account (only
 * counted for new accounts, once), then forgets it. Also sends the Meta sign-up event for an
 * account just created with Apple or Google (email sign-ups send it from the form).
 */
export function AttributionSync() {
  useEffect(() => {
    if (document.cookie.split("; ").includes(`${NEW_OAUTH_COOKIE}=1`)) {
      document.cookie = `${NEW_OAUTH_COOKIE}=; path=/; max-age=0; samesite=lax`;
      pixelEvent("CompleteRegistration");
    }
    const touch = decodeTouch(getTouchCookie());
    if (!touch) return;
    void supabaseBrowser()
      .rpc("record_attribution", { p_props: touch })
      .then(({ error }) => {
        // Before migration 13 the function is missing: keep the cookie and try again later.
        if (!error) clearTouchCookie();
      });
  }, []);
  return null;
}
