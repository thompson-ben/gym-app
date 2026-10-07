"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { IconX } from "../icons";
import { Button, ErrorNote, Field, IconButton, Input } from "../ui";

export type FreeAccessList = {
  /** Migration 15: whether paid plans are live, and early-access members (trial at launch). */
  live?: boolean;
  pending: { email: string; note: string | null; invited_at: string }[];
  free: { email: string; note: string | null; since: string }[];
  early?: { email: string; since: string }[];
};

/** Give friends free access by email. Shows email addresses: admin page only. */
export function FreeAccess({ list, emailReady }: { list: FreeAccessList; emailReady: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await fetch("/api/admin/free-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, note }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; result?: string; email?: string; emailed?: boolean; was_paying?: boolean };
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Couldn’t save. Please try again.");
    setDone(
      json.result === "granted"
        ? `${json.email} already had an account and now has free access.${json.was_paying ? " They were paying: cancel their subscription in Stripe so they aren’t charged again." : ""}`
        : json.result === "already_free"
          ? `${json.email} already has free access.`
          : json.emailed
            ? `Invite emailed to ${json.email}. They’ll get free access when they sign up with that address.`
            : `${json.email} will get free access when they sign up with that address. The invite email couldn’t be sent${emailReady ? "" : " (email isn’t set up yet)"}, so send them a link to notchlift.com yourself.`,
    );
    setEmail("");
    setNote("");
    router.refresh();
  }

  async function revoke(address: string, member = false) {
    if (member && !window.confirm(`Remove free access for ${address}? ${list.live ? "They’ll start a 14-day trial." : "They’ll move to early access."}`)) return;
    await fetch("/api/admin/free-access", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address, member }) });
    router.refresh();
  }

  async function promote(address: string) {
    await fetch("/api/admin/free-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address }) });
    router.refresh();
  }

  const [showEarly, setShowEarly] = useState(false);
  const early = list.early ?? [];

  const free = showAll ? list.free : list.free.slice(0, 8);
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">
          Friends and family get NotchLift free, with no trial and no payment. If they already have an account, it switches now. If not, they’re emailed an
          invite and get free access when they sign up with that address.
        </p>
        <Field label="Email address">
          {(id) => <Input id={id} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />}
        </Field>
        <Field label="Note (optional)" hint="Only you see this, unless they’re invited: then it’s quoted in the email.">
          {(id, d) => <Input id={id} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Gym buddy" />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        {done ? <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm">{done}</p> : null}
        <Button type="submit" variant="primary" className="w-full" busy={busy}>Give free access</Button>
      </form>

      {list.pending.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted">Invited, not signed up yet ({list.pending.length})</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {list.pending.map((p) => (
              <li key={p.email} className="flex items-center gap-2 py-1 pr-1 pl-4">
                <span className="min-w-0 flex-1 py-1.5">
                  <span className="block truncate text-sm font-medium">{p.email}</span>
                  <span className="block truncate text-xs text-muted">{p.note ? `${p.note} · ` : ""}invited {formatDate(p.invited_at, undefined, { year: undefined })}</span>
                </span>
                <IconButton label={`Cancel invite for ${p.email}`} onClick={() => void revoke(p.email)}><IconX size={18} /></IconButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-sm font-medium text-muted">Free access: stays free for good ({list.free.length})</h3>
        {list.free.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {free.map((f) => (
              <li key={f.email} className="flex items-center gap-2 py-1 pr-1 pl-4">
                <span className="min-w-0 flex-1 py-1.5">
                  <span className="block truncate text-sm font-medium">{f.email}</span>
                  <span className="block truncate text-xs text-muted">{f.note ?? "Free access"}</span>
                </span>
                <IconButton label={`Remove free access for ${f.email}`} onClick={() => void revoke(f.email, true)}><IconX size={18} /></IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">Nobody yet.</p>
        )}
        {list.free.length > 8 && !showAll ? (
          <Button size="sm" variant="quiet" className="mt-1" onClick={() => setShowAll(true)}>Show all {list.free.length}</Button>
        ) : null}
      </div>

      {list.early ? (
        <div>
          <h3 className="mb-1 text-sm font-medium text-muted">Early access ({early.length})</h3>
          <p className="mb-2 text-xs text-faint">Free until you launch paid membership, then they start a 14-day trial. Give anyone here free access to keep them free.</p>
          {early.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
              {(showEarly ? early : early.slice(0, 8)).map((e) => (
                <li key={e.email} className="flex items-center gap-2 py-1.5 pr-2 pl-4">
                  <span className="min-w-0 flex-1 truncate text-sm">{e.email}</span>
                  <Button size="sm" variant="secondary" onClick={() => void promote(e.email)} aria-label={`Give ${e.email} free access`}>Free access</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">Nobody.</p>
          )}
          {early.length > 8 && !showEarly ? (
            <Button size="sm" variant="quiet" className="mt-1" onClick={() => setShowEarly(true)}>Show all {early.length}</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
