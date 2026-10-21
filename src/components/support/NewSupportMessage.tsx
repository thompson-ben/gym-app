"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BODY_MAX, SUBJECT_MAX, SUPPORT_TOPICS, validateMessage, type SupportTopic } from "@/lib/support";
import { LAST_PAGE_KEY } from "../FeedbackButton";
import { Button, ErrorNote, Input, cx } from "../ui";

/** Start a support conversation: topic, subject and message. Opens the conversation once sent. */
export function NewSupportMessage() {
  const router = useRouter();
  const [topic, setTopic] = useState<SupportTopic>("logging");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateMessage(subject, body);
    if (invalid) return setError(invalid);
    if (!navigator.onLine) return setError("You’re offline. Your message is still here; send it when you’re back online.");
    setBusy(true);
    setError(null);
    let page: string | null = null;
    try {
      page = window.sessionStorage.getItem(LAST_PAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", topic, subject, body, page, app_version: process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 80) ?? null }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; thread?: { id: string } };
    if (!res.ok || !json.thread) {
      setBusy(false);
      return setError(json.error ?? "Couldn’t send. Your message is still here; please try again.");
    }
    router.push(`/profile/support/${json.thread.id}?sent=1`);
  }

  return (
    <form onSubmit={send} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">What’s it about?</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_TOPICS.map((t) => (
            <label key={t.value} className={cx("flex h-11 cursor-pointer items-center rounded-xl border px-3 text-sm", topic === t.value ? "border-accent-text bg-accent-soft font-medium text-fg" : "border-line text-muted")}>
              <input type="radio" name="topic" value={t.value} checked={topic === t.value} onChange={() => setTopic(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="support-subject" className="mb-1.5 block text-sm font-medium text-muted">Subject</label>
        <Input id="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUBJECT_MAX} placeholder="e.g. My workout didn’t save" />
      </div>
      <div>
        <label htmlFor="support-body" className="mb-1.5 block text-sm font-medium text-muted">Message</label>
        <textarea
          id="support-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={7}
          placeholder={topic === "bug" ? "What happened, and what did you expect? Which screen were you on?" : "How can we help?"}
          className="w-full rounded-2xl border border-line bg-field p-4 text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--ring)]"
        />
        <p className="mt-1 text-xs text-faint">Sent with the screen you were last on, the app version and your device type, to help sort problems out.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Send message</Button>
    </form>
  );
}
