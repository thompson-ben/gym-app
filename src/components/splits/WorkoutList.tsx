"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconMore, IconPlus } from "../icons";
import { Button, ErrorNote, Field, IconButton, Input, SectionTitle, Sheet } from "../ui";

export type TemplateSummary = { id: string; name: string; exercises: string[] };

export function WorkoutList({ splitId, templates }: { splitId: string; templates: TemplateSummary[] }) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menuFor, setMenuFor] = useState<TemplateSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("workout_templates")
      .insert({ split_id: splitId, name: name.trim(), position: templates.length })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(friendlyError(error));
    router.push(`/splits/${splitId}/workouts/${data.id}`);
  }

  async function move(index: number, direction: -1 | 1) {
    const order = templates.map((t) => t.id);
    const j = index + direction;
    [order[index], order[j]] = [order[j], order[index]];
    setBusy(true);
    const results = await Promise.all(order.map((id, position) => supabase.from("workout_templates").update({ position }).eq("id", id)));
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(friendlyError(failed.error));
    router.refresh();
  }

  async function duplicate(t: TemplateSummary) {
    setBusy(true);
    const { error } = await supabase.rpc("duplicate_template", { p_template_id: t.id });
    setBusy(false);
    setMenuFor(null);
    if (error) return setError(friendlyError(error));
    router.refresh();
  }

  async function remove(t: TemplateSummary) {
    setBusy(true);
    const { error } = await supabase.from("workout_templates").delete().eq("id", t.id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return setError(friendlyError(error));
    router.refresh();
  }

  return (
    <section>
      <SectionTitle action={<Button size="sm" variant="quiet" onClick={() => setAdding(true)}><IconPlus size={16} /> Add workout</Button>}>
        Workouts
      </SectionTitle>
      <ErrorNote>{error}</ErrorNote>
      {templates.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line px-6 py-8 text-center">
          <p className="font-medium">No workouts yet</p>
          <p className="mt-1 text-sm text-muted">Add the workouts you rotate through, e.g. Push, Pull and Legs.</p>
          <Button className="mt-4" variant="primary" onClick={() => setAdding(true)}><IconPlus size={16} /> Add workout</Button>
        </div>
      ) : (
        <ol className="space-y-2">
          {templates.map((t, i) => (
            <li key={t.id} className="flex items-center gap-1 rounded-3xl border border-line bg-surface py-2 pr-2 pl-4">
              <Link href={`/splits/${splitId}/workouts/${t.id}`} className="min-w-0 flex-1 py-1">
                <span className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{t.name}</span>
                  <IconChevronRight size={16} className="shrink-0 text-faint" />
                </span>
                <span className="block truncate text-sm text-muted">
                  {t.exercises.length ? t.exercises.join(" · ") : "No exercises yet"}
                </span>
              </Link>
              <IconButton label={`Move ${t.name} up`} disabled={i === 0 || busy} onClick={() => move(i, -1)}><IconArrowUp size={18} /></IconButton>
              <IconButton label={`Move ${t.name} down`} disabled={i === templates.length - 1 || busy} onClick={() => move(i, 1)}><IconArrowDown size={18} /></IconButton>
              <IconButton label={`${t.name} options`} onClick={() => setMenuFor(t)}><IconMore size={18} /></IconButton>
            </li>
          ))}
        </ol>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add workout">
        <form onSubmit={add} className="space-y-4 pb-2">
          <Field label="Workout name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Push" autoFocus required />}</Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Add and edit exercises</Button>
        </form>
      </Sheet>

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ""}>
        {menuFor ? (
          <div className="space-y-2 pb-2">
            <Link href={`/splits/${splitId}/workouts/${menuFor.id}`} className="flex h-11 w-full items-center justify-center rounded-2xl border border-line bg-surface-2">Edit workout</Link>
            <Button variant="secondary" className="w-full" busy={busy} onClick={() => duplicate(menuFor)}>Duplicate workout</Button>
            <Button variant="danger" className="w-full" onClick={() => { setConfirmDelete(menuFor); setMenuFor(null); }}>Remove workout</Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Remove ${confirmDelete?.name ?? "workout"}?`}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" size="lg" className="flex-1" busy={busy} onClick={() => confirmDelete && remove(confirmDelete)}>Remove</Button>
          </div>
        }
      >
        <p className="text-muted">The workout template is removed from this split. Sessions you already logged with it, and your exercise history, are kept.</p>
      </Sheet>
    </section>
  );
}
