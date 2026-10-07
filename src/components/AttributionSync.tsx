"use client";

import { useEffect } from "react";
import { decodeTouch } from "@/lib/attribution";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearTouchCookie, getTouchCookie } from "@/lib/track";

/**
 * After sign-in, attaches the campaign that first brought this browser to the account (only
 * counted for new accounts, once), then forgets it.
 */
export function AttributionSync() {
  useEffect(() => {
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
