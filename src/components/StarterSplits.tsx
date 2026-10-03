"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STARTERS, type StarterPlan } from "@/lib/starters";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, ErrorNote, Sheet } from "./ui";

/** Lets a new user start from a ready-made split, created and activated in one step. */
export function StarterSplits() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<StarterPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(plan: StarterPlan) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().rpc("create_split_from_plan", {
      p_plan: { name: plan.name, description: plan.description, workouts: plan.workouts },
      p_activate: true,
    });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, "Could not create the split. Please try again."));
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" size="lg" className="w-full" onClick={() => { setChosen(null); setError(null); setOpen(true); }}>
        Start from a template
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={chosen ? chosen.name : "Choose a starting split"}>
        {chosen ? (
          <div className="space-y-4 pb-2">
            <p className="text-muted">{chosen.description}</p>
            <ol className="space-y-3">
              {chosen.workouts.map((w) => (
                <li key={w.name} className="rounded-2xl border border-line px-4 py-3">
                  <p className="font-medium">{w.name}</p>
                  <p className="text-sm text-muted">{w.exercises.map((e) => { const n = e.slug.replace(/-/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); }).join(" · ")}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-faint">It becomes your active split. Rename, reorder or swap any exercise afterwards from Splits.</p>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setChosen(null)}>Back</Button>
              <Button variant="primary" size="lg" className="flex-1" busy={busy} onClick={() => create(chosen)}>Use this split</Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2 pb-2">
            {STARTERS.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => setChosen(s)} className="w-full rounded-2xl border border-line px-4 py-3 text-left hover:bg-surface-2">
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-sm text-muted">{s.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
