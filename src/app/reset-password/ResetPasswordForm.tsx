"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.code === "same_password"
          ? "Choose a password different from your current one."
          : error.code === "weak_password"
            ? "That password is too weak. Try a longer one."
            : "Could not update your password. Your reset link may have expired; request a new one.",
      );
      return;
    }
    router.replace("/train");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-muted">You will stay signed in on this device.</p>
      </div>
      <Field label="New password" hint="At least 8 characters.">
        {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirm new password">
        {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Update password</Button>
    </form>
  );
}
