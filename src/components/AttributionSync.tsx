"use client";

import { useEffect } from "react";
import { decodeTouch } from "@/lib/attribution";
import { NEW_OAUTH_COOKIE } from "@/lib/auth-providers";
import { isNativeApp } from "@/lib/native";
import { pixelEvent } from "@/lib/pixel";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearTouchCookie, getTouchCookie } from "@/lib/track";

/**
 * After sign-in, attaches the campaign that first brought this browser to the account (only
 * counted for new accounts, once), then forgets it. Also sends the Meta sign-up event for an
 * account just created with Apple or Google (email sign-ups send it from the form). And, at most
 * once a day, notes whether this is the iPhone app or the website (migration 40), so the
 * dashboard can show sign-ups by platform and who uses the app.
 */
export function AttributionSync() {
  useEffect(() => {
    if (document.cookie.split("; ").includes(`${NEW_OAUTH_COOKIE}=1`)) {
      document.cookie = `${NEW_OAUTH_COOKIE}=; path=/; max-age=0; samesite=lax`;
      pixelEvent("CompleteRegistration");
    }
    notePlatform();
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

const PLATFORM_KEY = "sm-platform-noted";

function notePlatform() {
  const platform = isNativeApp() ? "ios_app" : "web";
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (window.localStorage.getItem(PLATFORM_KEY) === `${platform}:${today}`) return;
  } catch {
    /* storage unavailable: note it anyway */
  }
  void supabaseBrowser()
    .rpc("note_platform", { p_platform: platform })
    .then(({ error }) => {
      // Before migration 40 the function is missing: try again next time.
      if (error) return;
      try {
        window.localStorage.setItem(PLATFORM_KEY, `${platform}:${today}`);
      } catch {
        /* ignore */
      }
    });
}
