"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { IconPlus } from "../icons";
import { Button, ErrorNote, Field, Input, Sheet } from "../ui";

export function NewSplitButton({ label = "New split", variant = "secondary", autoOpen = false }: { label?: string; variant?: "primary" | "secondary"; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give your split a name.");
    setBusy(true);
    const { data, error } = await supabaseBrowser()
      .from("splits")
      .insert({ name: name.trim(), description: description.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(friendlyError(error, "Could not create the split."));
    router.push(`/splits/${data.id}`);
  }

  return (
    <>
      <Button variant={variant} size={variant === "primary" ? "lg" : "sm"} onClick={() => setOpen(true)}>
        <IconPlus size={16} /> {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New split">
        <form onSubmit={create} className="space-y-4 pb-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. My 3-day split" autoFocus required />}</Field>
          <Field label="Description (optional)">
            {(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="e.g. Push / Pull / Legs" />}
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Create split</Button>
        </form>
      </Sheet>
    </>
  );
}
