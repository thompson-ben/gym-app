"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { humanize } from "@/lib/format";
import { EQUIPMENT, MUSCLES, type Exercise } from "@/lib/types";
import { Button, ErrorNote, Field, Input, Sheet, inputClass } from "./ui";

/** Renames a custom exercise. History references the exercise id, so nothing is lost. */
export function CustomExerciseEditor({ exercise }: { exercise: Exercise }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [variant, setVariant] = useState(exercise.variant ?? "");
  const [muscle, setMuscle] = useState(exercise.primary_muscle);
  const [equipment, setEquipment] = useState(exercise.equipment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabaseBrowser().from("exercises").update({ name: name.trim(), variant: variant.trim() || null, primary_muscle: muscle, equipment }).eq("id", exercise.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>Edit</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit custom exercise">
        <form onSubmit={save} className="space-y-4 pb-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />}</Field>
          <Field label="Variant (optional)">{(id) => <Input id={id} value={variant} onChange={(e) => setVariant(e.target.value)} maxLength={80} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Muscle">
              {(id) => (
                <select id={id} className={inputClass} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
                  {MUSCLES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                </select>
              )}
            </Field>
            <Field label="Equipment">
              {(id) => (
                <select id={id} className={inputClass} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                  {EQUIPMENT.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                </select>
              )}
            </Field>
          </div>
          <p className="text-sm text-muted">Renaming keeps all history. Workouts already logged show the name used at the time.</p>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Save</Button>
        </form>
      </Sheet>
    </>
  );
}
