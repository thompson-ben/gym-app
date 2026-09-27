"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatElapsed } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, Card, ErrorNote } from "../ui";
import { WorkoutDateSheet } from "../WorkoutDateSheet";

type OpenPeriod = { id: string; started_at: string; completed_workouts: number };

export function ActivationCard({ splitId, open, timeZone }: { splitId: string; open: OpenPeriod | null; timeZone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"activate" | "move" | null>(null);

  async function activate(startedAt: string | null): Promise<string | null> {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc("activate_split", { p_split_id: splitId, p_started_at: startedAt });
    setBusy(false);
    if (error) {
      const message = friendlyError(error);
      if (!startedAt) setError(message);
      return message;
    }
    setPicker(null);
    router.refresh();
    return null;
  }

  async function moveStart(iso: string): Promise<string | null> {
    if (!open) return null;
    const { error } = await supabaseBrowser().rpc("update_active_period", { p_period_id: open.id, p_started_at: iso, p_ended_at: null });
    if (error) return friendlyError(error);
    setPicker(null);
    router.refresh();
    return null;
  }

  async function deactivate() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc("deactivate_split");
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.refresh();
  }

  const weekAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };

  return (
    <Card className="p-5" id="active">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPicker("move")}>Change start date</Button>
            <Button variant="quiet" size="sm" busy={busy} onClick={deactivate}>End active period</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Not active</p>
            <p className="text-sm text-muted">Activating ends your current split’s period and starts a new one here.</p>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button variant="primary" busy={busy && picker === null} onClick={() => activate(null)}>Activate split</Button>
            <button type="button" onClick={() => setPicker("activate")} className="h-9 rounded-xl px-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
              Activate from an earlier date
            </button>
          </div>
        </div>
      )}
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>

      <WorkoutDateSheet
        open={picker === "move"}
        onClose={() => setPicker(null)}
        title="Active since"
        fieldLabel="Split started"
        description="When did you start training on this split? Workouts from that date on count towards this period."
        initialIso={open?.started_at ?? weekAgo()}
        confirmLabel="Save start date"
        onConfirm={moveStart}
      />
      <WorkoutDateSheet
        open={picker === "activate"}
        onClose={() => setPicker(null)}
        title="Activate from an earlier date"
        fieldLabel="Split started"
        description="Your current split’s active period (if any) will end on this date, and this split becomes active from it. It cannot overlap earlier periods."
        initialIso={weekAgo()}
        confirmLabel="Activate split"
        onConfirm={(iso) => activate(iso)}
      />
    </Card>
  );
}
