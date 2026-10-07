"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { formatWeightValue, INCREMENT_RANGE, parseIncrement, type WeightUnit } from "@/lib/units";
import { Button, ErrorNote, Field, Input, Sheet, Toggle } from "../ui";

/**
 * Next-session target settings for one workout entry, editable mid-workout. Saves to the
 * workout template (so it applies to future sessions too) and returns the new settings.
 */
export function TargetSettingsSheet({
  open,
  onClose,
  exerciseName,
  entryId,
  hasRange,
  unit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  entryId: string;
  hasRange: boolean;
  unit: WeightUnit;
  onSaved: (enabled: boolean) => Promise<void>;
}) {
  return open ? <Inner {...{ onClose, exerciseName, entryId, hasRange, unit, onSaved }} /> : null;
}

function Inner({ onClose, exerciseName, entryId, hasRange, unit, onSaved }: { onClose: () => void; exerciseName: string; entryId: string; hasRange: boolean; unit: WeightUnit; onSaved: (enabled: boolean) => Promise<void> }) {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [increment, setIncrement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabaseBrowser()
      .from("template_exercises")
      .select("progression_enabled, progression_increment_kg")
      .eq("id", entryId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setError(navigator.onLine ? "Could not load the current settings." : "Target settings need a connection.");
        if (data) {
          // Opening the sheet is usually to switch targets on, so it starts on.
          setEnabled(true);
          setIncrement(data.progression_increment_kg === null ? "" : formatWeightValue(Number(data.progression_increment_kg), unit));
        }
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [entryId, unit]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError("Target settings need a connection.");
    const parsed = parseIncrement(increment, unit);
    const inc = "kg" in parsed ? parsed.kg : null;
    if (enabled) {
      if (!hasRange) return setError("This exercise needs a rep range (min and max) first. Set it in the workout editor.");
      if ("error" in parsed) return setError(parsed.error);
      if (inc === null) return setError(`Choose a weight increment between ${INCREMENT_RANGE[unit].min} and ${INCREMENT_RANGE[unit].max} ${unit}.`);
    }
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser()
      .from("template_exercises")
      .update({ progression_enabled: enabled, progression_increment_kg: inc })
      .eq("id", entryId);
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, "Could not save. Please try again."));
    }
    await onSaved(enabled);
    setBusy(false);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Targets · ${exerciseName}`}>
      <form onSubmit={save} className="space-y-4 pb-2">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Suggest targets"
          description="When every working set reaches the top of the rep range, the next target adds your increment. Otherwise it keeps the weight and aims for more reps."
        />
        {enabled ? (
          <Field
            label={`Weight increment (${unit})`}
            hint={unit === "lb" ? "What you add when you move up, e.g. the next dumbbell (often 2.5–5 lb) or the next pin on a stack." : "What you add when you move up, e.g. the next dumbbell (often 1–2.5 kg) or the next pin on a stack."}
          >
            {(id, d) => (
              <Input id={id} aria-describedby={d} inputMode="decimal" value={increment} onChange={(e) => setIncrement(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={INCREMENT_RANGE[unit].example} disabled={!loaded} />
            )}
          </Field>
        ) : null}
        <p className="text-sm text-faint">Saved to this workout, so it applies every time you do it. Targets are suggestions and never count as sets.</p>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy} disabled={!loaded}>Save</Button>
      </form>
    </Sheet>
  );
}
