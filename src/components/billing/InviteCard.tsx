"use client";

import { useState } from "react";
import { REFERRAL_DAYS, inviteLink, inviteMessage, type ReferralStatus } from "@/lib/referral";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buttonClass } from "../styles";

/** Trial members: invite a training partner to earn 14 more free days (once). */
export function InviteCard({ status }: { status: ReferralStatus }) {
  const [copied, setCopied] = useState(false);
  if (status.rewarded_at) {
    return (
      <div id="invite" className="mt-3 scroll-mt-6 rounded-3xl border border-accent-text/40 bg-accent-soft p-4">
        <p className="font-semibold">You earned {REFERRAL_DAYS} extra days</p>
        <p className="mt-1 text-sm text-muted">A friend you invited started training. Thanks for sharing Setmodo.</p>
      </div>
    );
  }
  if (!status.code) return null;
  const link = inviteLink(status.code);
  // Counted for the admin dashboard (migration 36; before it the call fails quietly).
  const noteShared = (method: "share" | "copy") => void supabaseBrowser().rpc("note_invite_shared", { p_method: method }).then(() => undefined, () => undefined);
  async function share() {
    const text = inviteMessage(status.code!);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Setmodo", text });
        noteShared("share");
        return;
      }
    } catch {
      return; // cancelled
    }
    try {
      await navigator.clipboard.writeText(text);
      noteShared("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the link is shown below to copy by hand */
    }
  }
  return (
    <div id="invite" className="mt-3 scroll-mt-6 rounded-3xl border border-line bg-surface p-4">
      <p className="font-semibold">Get {REFERRAL_DAYS} more days free</p>
      <p className="mt-1 text-sm text-muted">
        Invite a training partner. When they sign up with your link and log their first workout, your trial gets {REFERRAL_DAYS} more days.
        Once per account. Group workout invites and shared splits count too.
      </p>
      <p className="mt-3 truncate rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs text-muted" aria-label="Your invite link">{link}</p>
      <button type="button" onClick={share} className={buttonClass("primary", "md", "mt-3 w-full")}>{copied ? "Copied" : "Share invite"}</button>
      {status.invited > 0 ? (
        <p className="mt-2 text-xs text-faint">{status.invited} signed up · {status.training} started training</p>
      ) : null}
    </div>
  );
}
