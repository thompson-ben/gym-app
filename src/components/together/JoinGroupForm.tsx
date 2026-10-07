"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { Button, ErrorNote, Field, Input } from "../ui";

export function JoinGroupForm({ token, defaultName }: { token: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Add the name your training partners will see.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("join_group_workout", { p_token: token, p_display_name: name.trim() });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, "Could not join. Please try again."));
    }
    router.replace(`/together/${data as string}`);
  }

  return (
    <form onSubmit={join} className="space-y-4 rounded-3xl border border-line bg-surface p-5">
      <Field label="Your name" hint="What the group will see. Your email is never shown.">
        {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" required />}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Join group workout</Button>
    </form>
  );
}
