"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, Input } from "../ui";

/** The one-time switch from early access to paid membership. */
export function LaunchPanel({ live, earlyCount, freeCount, paymentsReady }: { live: boolean; earlyCount: number; freeCount: number; paymentsReady: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (live) {
    return <p className="rounded-3xl border border-line bg-surface p-4 text-sm">Paid membership is live. New sign-ups start a 14-day trial.</p>;
  }

  async function launch() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; trials_started?: number; emailed?: number };
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Launch failed. Nothing was changed.");
    setDone(`Launched. ${json.trials_started} early-access ${json.trials_started === 1 ? "member" : "members"} started a 14-day trial; ${json.emailed} emailed.`);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-3xl border border-accent-text/40 bg-surface p-4">
      <p className="font-semibold">Launch paid membership</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>New sign-ups start a 14-day free trial instead of free early access.</li>
        <li>
          {earlyCount} early-access {earlyCount === 1 ? "member starts" : "members start"} a 14-day trial today and {earlyCount === 1 ? "gets" : "get"} a short
          “your 14 free days start today” email.
        </li>
        <li>{freeCount} with free access stay free. Nothing anyone has logged changes.</li>
        <li>The landing page switches to the trial and prices.</li>
      </ul>
      {!paymentsReady ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Finish the Stripe setup (keys and secrets in Vercel) first, then test a payment.</p>
      ) : null}
      <Field label="Type LAUNCH to confirm">
        {(id) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={!paymentsReady} />}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      {done ? <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm">{done}</p> : null}
      <Button variant="primary" className="w-full" busy={busy} disabled={!paymentsReady || confirm.trim() !== "LAUNCH"} onClick={launch}>
        Launch paid membership
      </Button>
    </div>
  );
}
