"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatElapsed } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, Card, ErrorNote } from "../ui";

export function ActivationCard({
  splitId,
  open,
  timeZone,
}: {
  splitId: string;
  open: { started_at: string; completed_workouts: number } | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: "activate_split" | "deactivate_split") {
    setBusy(true);
    setError(null);
    const { error } = fn === "activate_split" ? await supabaseBrowser().rpc(fn, { p_split_id: splitId }) : await supabaseBrowser().rpc(fn);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  }

  return (
    <Card className="p-5">
      {open ? (
        <>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            <p className="font-medium">Active</p>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted">Since</dt>
              <dd className="mt-0.5 font-medium">{formatDate(open.started_at, timeZone)}</dd>
            </div>
            <div>
              <dt className="text-muted">Running</dt>
              <dd className="mt-0.5 font-medium">{formatElapsed(open.started_at)}</dd>
            </div>
            <div>
              <dt className="text-muted">Workouts</dt>
              <dd className="mt-0.5 font-medium tabular">{open.completed_workouts}</dd>
            </div>
          </dl>
          <Button className="mt-4" variant="quiet" size="sm" busy={busy} onClick={() => run("deactivate_split")}>
            End active period
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Not active</p>
            <p className="text-sm text-muted">Activating ends your current split’s period and starts a new one here.</p>
          </div>
          <Button variant="primary" busy={busy} onClick={() => run("activate_split")}>Activate split</Button>
        </div>
      )}
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
    </Card>
  );
}
