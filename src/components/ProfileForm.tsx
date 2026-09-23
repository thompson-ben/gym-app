"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { clearUser, hasUnsyncedChanges, listRecords } from "@/lib/session/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, Card, ErrorNote, Field, Input, SectionTitle, Sheet, Toggle, inputClass } from "./ui";

type Profile = { display_name: string | null; default_rest_seconds: number; auto_start_rest: boolean; weight_unit: string };

export function ProfileForm({ userId, email, profile }: { userId: string; email: string | null; profile: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [rest, setRest] = useState(profile.default_rest_seconds);
  const [autoRest, setAutoRest] = useState(profile.auto_start_rest);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    const { error } = await supabaseBrowser()
      .from("profiles")
      .update({ display_name: displayName.trim() || null, default_rest_seconds: rest, auto_start_rest: autoRest })
      .eq("id", userId);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setError(null);
    setSaved(true);
    router.refresh();
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

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-5">
        <Card className="space-y-5 p-5">
          <Field label="Email">{(id) => <Input id={id} value={email ?? ""} readOnly disabled />}</Field>
          <Field label="Display name (optional)" hint="Only you see this. Splitmate has no public profiles.">
            {(id, d) => <Input id={id} aria-describedby={d} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />}
          </Field>
          <Field label="Units" hint="Weights are recorded in kilograms.">{(id, d) => <Input id={id} aria-describedby={d} value="Kilograms (kg)" readOnly disabled />}</Field>
        </Card>

        <div>
          <SectionTitle>Rest timer</SectionTitle>
          <Card className="space-y-3 p-5">
            <Field label="Default rest" hint="Used when an exercise has no rest target.">
              {(id, d) => (
                <select id={id} aria-describedby={d} className={inputClass} value={rest} onChange={(e) => setRest(Number(e.target.value))}>
                  {[45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{formatDuration(s)}</option>)}
                </select>
              )}
            </Field>
            <Toggle label="Auto-start after each set" description="Starts the rest timer when you confirm a set." checked={autoRest} onChange={setAutoRest} />
          </Card>
        </div>

        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>{saved ? "Saved" : "Save changes"}</Button>
      </form>

      <div>
        <SectionTitle>Privacy</SectionTitle>
        <Card className="p-5 text-sm text-muted">
          Your splits, workouts and history are private to your account. Sharing a split shares only its structure and targets, never your weights, reps or history.
        </Card>
      </div>

      <Button variant="secondary" size="lg" className="w-full" onClick={() => signOut()} busy={busy}>Sign out</Button>

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
