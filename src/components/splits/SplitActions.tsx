"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconMore } from "../icons";
import { Button, ErrorNote, Field, IconButton, Input, Sheet } from "../ui";

type Split = { id: string; name: string; description: string | null; archived_at: string | null };

export function SplitActions({ split, isActive }: { split: Split; isActive: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [name, setName] = useState(split.name);
  const [description, setDescription] = useState(split.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("The split needs a name.");
    setBusy(true);
    const { error } = await supabase.from("splits").update({ name: name.trim(), description: description.trim() || null }).eq("id", split.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setEditing(false);
    router.refresh();
  }

  async function duplicate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("duplicate_split", { p_split_id: split.id });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setMenu(false);
    router.push(`/splits/${data}`);
  }

  async function archive(endActive: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("archive_split", { p_split_id: split.id, p_end_active_period: endActive });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setArchiving(false);
    router.refresh();
  }

  async function restore() {
    setBusy(true);
    const { error } = await supabase.from("splits").update({ archived_at: null }).eq("id", split.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setMenu(false);
    router.refresh();
  }

  return (
    <>
      <IconButton label="Split options" onClick={() => { setError(null); setMenu(true); }}>
        <IconMore />
      </IconButton>
      <Sheet open={menu} onClose={() => setMenu(false)} title={split.name}>
        <div className="space-y-2 pb-2">
          <Button variant="secondary" className="w-full" onClick={() => { setMenu(false); setEditing(true); }}>Rename or edit description</Button>
          <Button variant="secondary" className="w-full" busy={busy} onClick={duplicate}>Duplicate split</Button>
          {split.archived_at ? (
            <Button variant="secondary" className="w-full" busy={busy} onClick={restore}>Restore split</Button>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => { setMenu(false); setArchiving(true); }}>Archive split</Button>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit split">
        <form onSubmit={save} className="space-y-4 pb-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />}</Field>
          <Field label="Description (optional)">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Save</Button>
        </form>
      </Sheet>

      <Sheet
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archive this split?"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" className="flex-1" onClick={() => setArchiving(false)}>Cancel</Button>
            <Button variant="danger" size="lg" className="flex-1" busy={busy} onClick={() => archive(isActive)}>
              {isActive ? "End period & archive" : "Archive"}
            </Button>
          </div>
        }
      >
        <p className="text-muted">
          Archived splits are hidden from your list but can be restored at any time. Workouts you logged and your exercise history are kept.
        </p>
        {isActive ? <p className="mt-3 font-medium">This split is active. Archiving it will end its active period, leaving you with no active split.</p> : null}
        <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      </Sheet>
    </>
  );
}
