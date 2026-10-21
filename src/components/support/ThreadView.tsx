"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { BODY_MAX, authorLabel, supportError, validateMessage, type SupportStatus, type SupportThread } from "@/lib/support";
import { Button, ErrorNote, cx } from "../ui";

const textareaClass = "w-full rounded-2xl border border-line bg-field p-4 text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--ring)]";

/**
 * One support conversation with a reply box. Members reply as themselves; admins reply as
 * NotchLift (and can close the thread). Times show in the viewer's own time zone.
 */
export function ThreadView({ thread, admin = false }: { thread: SupportThread; admin?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"send" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function send(close: boolean) {
    const invalid = validateMessage(null, body);
    if (invalid) return setError(invalid);
    if (!navigator.onLine) return setError("You’re offline. Your message is still here; send it when you’re back online.");
    setBusy(close ? "close" : "send");
    setError(null);
    setNote(null);
    const res = await fetch(admin ? "/api/admin/support" : "/api/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reply", thread: thread.id, body, close }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean };
    setBusy(null);
    if (!res.ok) return setError(json.error ?? supportError(undefined) ?? "Couldn’t send. Your message is still here; please try again.");
    setBody("");
    if (admin) setNote(json.emailed ? "Sent. They’ve been emailed a copy." : "Saved. The email notice couldn’t be sent, so they’ll see it next time they open Help & support.");
    router.refresh();
  }

  async function setStatus(status: SupportStatus) {
    await fetch("/api/admin/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", thread: thread.id, status }) });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-3" aria-label="Messages">
        {thread.messages.map((m) => {
          const mine = admin ? m.author === "support" : m.author === "user";
          return (
            <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] rounded-3xl px-4 py-3", mine ? "rounded-br-lg bg-accent-soft" : "rounded-bl-lg border border-line bg-surface")}>
                <p className="text-xs font-medium text-muted">
                  {admin ? (m.author === "user" ? "Them" : authorLabel(m)) : authorLabel(m)} · <time dateTime={m.created_at} suppressHydrationWarning>{formatDateTime(m.created_at)}</time>
                </p>
                <p className="mt-1 break-words whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {!admin && thread.status === "closed" ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">This conversation is closed. Reply below if you still need help and it will reopen.</p>
      ) : null}
      {!admin && thread.status === "open" ? (
        <p className="text-sm text-muted" role="status">We usually reply within a day. You’ll get an email when we do.</p>
      ) : null}

      <form onSubmit={(e) => { e.preventDefault(); void send(false); }} className="space-y-3">
        <label htmlFor="support-reply" className="block text-sm font-medium text-muted">{admin ? "Reply as NotchLift" : "Your reply"}</label>
        <textarea id="support-reply" value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={admin ? 6 : 4} className={textareaClass} placeholder={admin ? "They’ll see this in the app and get it by email." : "Add more detail or reply"} />
        <ErrorNote>{error}</ErrorNote>
        {note ? <p className="text-sm text-muted" role="status">{note}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="lg" className="flex-1" busy={busy === "send"} disabled={busy !== null}>Send</Button>
          {admin ? <Button type="button" variant="secondary" size="lg" className="flex-1" busy={busy === "close"} disabled={busy !== null} onClick={() => void send(true)}>Send & close</Button> : null}
        </div>
      </form>

      {admin ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <span className="w-full text-sm text-muted">Without replying:</span>
          {thread.status !== "closed" ? <Button size="sm" variant="secondary" onClick={() => void setStatus("closed")}>Close</Button> : null}
          {thread.status !== "open" ? <Button size="sm" variant="secondary" onClick={() => void setStatus("open")}>Mark as needs reply</Button> : null}
          {thread.status === "open" ? <Button size="sm" variant="quiet" onClick={() => void setStatus("answered")}>Mark as answered</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
