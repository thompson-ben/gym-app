"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { clearUser, hasUnsyncedChanges, listRecords } from "@/lib/session/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconChevronRight } from "./icons";
import { Button, Input, SectionTitle, Sheet, Toggle, cx, inputClass } from "./ui";

type Profile = { display_name: string | null; default_rest_seconds: number; auto_start_rest: boolean; weight_unit: string };
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string; retry: () => void };

/**
 * Preferences save as soon as they change, each with its own visible status, so nothing
 * depends on finding a Save button (which the bottom navigation used to cover) and a failed
 * save is never silent.
 */
export function ProfileForm({ userId, email, profile }: { userId: string; email: string | null; profile: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [savedName, setSavedName] = useState(profile.display_name ?? "");
  const [rest, setRest] = useState(profile.default_rest_seconds);
  const [autoRest, setAutoRest] = useState(profile.auto_start_rest);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function save(field: string, patch: Partial<Profile>, revert: () => void) {
    setStatus((s) => ({ ...s, [field]: { kind: "saving" } }));
    const { error } = await supabaseBrowser().from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
    if (error) {
      revert();
      setStatus((s) => ({ ...s, [field]: { kind: "error", message: friendlyError(error, "Not saved."), retry: () => void save(field, patch, revert) } }));
      return false;
    }
    setStatus((s) => ({ ...s, [field]: { kind: "saved" } }));
    router.refresh();
    return true;
  }

  async function saveName(e?: React.FormEvent) {
    e?.preventDefault();
    const next = displayName.trim();
    if (next === savedName) return;
    const before = savedName;
    if (await save("name", { display_name: next || null }, () => setDisplayName(before))) setSavedName(next);
  }

  async function signOut(force = false) {
    const unsynced = listRecords(window.localStorage, userId).filter(hasUnsyncedChanges);
    if (unsynced.length && !force) return setConfirmSignOut(true);
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    // Local workout data is removed so the next person on this device cannot see it.
    clearUser(window.localStorage, userId);
    // A full page load drops all in-memory state of the previous account.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/sign-in");
  }

  const initial = (savedName || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-8">
      <section aria-label="Account" className="flex items-center gap-4">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xl font-semibold">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{savedName || "No display name"}</p>
          <p className="truncate text-sm text-muted">{email}</p>
        </div>
      </section>

      <section>
        <SectionTitle>Workout preferences</SectionTitle>
        <div className="divide-y divide-line rounded-3xl border border-line bg-surface">
          <form onSubmit={saveName} className="px-4 py-3">
            <label htmlFor="display-name" className="block text-sm font-medium text-muted">Display name (optional)</label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => void saveName()}
                maxLength={60}
                placeholder="Your name"
                aria-describedby="display-name-status"
              />
              {displayName.trim() !== savedName ? <Button type="submit" variant="secondary">Save</Button> : null}
            </div>
            <StatusLine id="display-name-status" status={status.name} hint="Only you see this. Splitmate has no public profiles." />
          </form>
          <div className="px-4 py-3">
            <label htmlFor="default-rest" className="block text-sm font-medium text-muted">Default rest</label>
            <select
              id="default-rest"
              aria-describedby="rest-status"
              className={cx(inputClass, "mt-1.5")}
              value={rest}
              onChange={(e) => {
                const before = rest;
                const next = Number(e.target.value);
                setRest(next);
                void save("rest", { default_rest_seconds: next }, () => setRest(before));
              }}
            >
              {[45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{formatDuration(s)}</option>)}
            </select>
            <StatusLine id="rest-status" status={status.rest} hint="Used when an exercise has no rest target." />
          </div>
          <div className="px-4 py-2">
            <Toggle
              label="Auto-start rest timer"
              description="Starts the rest timer when you confirm a set."
              checked={autoRest}
              onChange={(v) => {
                setAutoRest(v);
                void save("auto", { auto_start_rest: v }, () => setAutoRest(!v));
              }}
            />
            <StatusLine status={status.auto} />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-muted">Weight unit</span>
            <span>Kilograms (kg)</span>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Account</SectionTitle>
        <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-muted">Email</span>
            <span className="min-w-0 truncate">{email}</span>
          </div>
          <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="flex min-h-13 items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Change password</span>
              <span className="block text-sm text-muted">We email you a secure link to choose a new one.</span>
            </span>
            <IconChevronRight className="shrink-0 text-faint" />
          </Link>
          <button type="button" onClick={() => signOut()} disabled={busy} className="flex min-h-13 w-full items-center px-4 py-3 text-left font-medium text-danger hover:bg-surface-2/50 disabled:opacity-50">
            Sign out
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>Privacy</SectionTitle>
        <p className="rounded-3xl border border-line bg-surface p-4 text-sm text-muted">
          Your splits, workouts and history are private to your account. Sharing a split shares only its structure and targets, never your weights, reps or history.
        </p>
      </section>

      <Sheet
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Unsynced workout data"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setConfirmSignOut(false)}>Stay signed in</Button>
            <Button variant="danger" size="lg" className="flex-1" onClick={() => signOut(true)}>Sign out anyway</Button>
          </div>
        }
      >
        <p className="text-muted">Some workout changes on this device have not reached the server yet. Signing out removes them from this device. Reconnect and open your workout to sync first.</p>
      </Sheet>
    </div>
  );
}

function StatusLine({ status, hint, id }: { status?: Status; hint?: string; id?: string }) {
  if (status?.kind === "error") {
    return (
      <p id={id} role="alert" className="mt-1.5 text-sm text-danger">
        {status.message}{" "}
        <button type="button" onClick={status.retry} className="font-medium underline underline-offset-4">Try again</button>
      </p>
    );
  }
  const text = status?.kind === "saving" ? "Saving…" : status?.kind === "saved" ? "Saved" : hint;
  return text ? (
    <p id={id} aria-live="polite" className={cx("mt-1.5 text-sm", status?.kind === "saved" ? "text-accent-text" : "text-faint")}>
      {text}
    </p>
  ) : null;
}
