"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconChevronRight } from "./icons";
import { Button, ErrorNote, Sheet, cx } from "./ui";

const KINDS = [
  { value: "bug", label: "Problem" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
] as const;

/** The last in-app page before Profile, recorded by ClientBoot, so bug reports have context. */
export const LAST_PAGE_KEY = "splitmate-last-page";

export function FeedbackRow() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return setError("Write a few words first.");
    if (!navigator.onLine) return setError("You’re offline. Your message is still here; send it when you’re back online.");
    setBusy(true);
    setError(null);
    let page: string | null = null;
    try {
      page = window.sessionStorage.getItem(LAST_PAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    const { error } = await supabaseBrowser().from("feedback").insert({
      kind,
      message: message.trim().slice(0, 2000),
      page,
      app_version: process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 80) ?? null,
      user_agent: navigator.userAgent.slice(0, 400),
    });
    setBusy(false);
    if (error) return setError(friendlyError(error, "Could not send. Your message is still here; please try again."));
    setSent(true);
    setMessage("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setSent(false); setError(null); setOpen(true); }}
        className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Send feedback</span>
          <span className="block text-sm text-muted">Report a problem or suggest an idea.</span>
        </span>
        <IconChevronRight className="shrink-0 text-faint" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Send feedback">
        {sent ? (
          <div className="space-y-4 pb-2" role="status">
            <p className="font-medium">Thanks, that’s been sent.</p>
            <p className="text-muted">Every message is read. It helps shape what gets built next.</p>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4 pb-2">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-muted">What is it about?</legend>
              <div className="flex gap-2">
                {KINDS.map((k) => (
                  <label
                    key={k.value}
                    className={cx(
                      "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm",
                      kind === k.value ? "border-accent-text bg-accent-soft font-medium text-fg" : "border-line text-muted",
                    )}
                  >
                    <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                    {k.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="feedback-message" className="mb-1.5 block text-sm font-medium text-muted">Message</label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={kind === "bug" ? "What happened, and what did you expect?" : "Tell us what you’d like"}
                className="w-full rounded-2xl border border-line bg-field p-4 text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--ring)]"
              />
              <p className="mt-1 text-xs text-faint">Sent with the screen you were last on, the app version and your device type, to help fix problems.</p>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Send</Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
