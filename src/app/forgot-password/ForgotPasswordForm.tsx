"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Requests a reset email. The response is identical whether or not an account exists for
 * the address, so the form cannot be used to discover who has an account.
 */
export function ForgotPasswordForm({ initialEmail, linkInvalid }: { initialEmail: string; linkInvalid: boolean }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      // Only a rate limit is surfaced; it does not depend on whether the account exists.
      if (error && error.status === 429) {
        setError("Too many requests. Please wait a minute and try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-muted">
          If an account exists for <span className="text-fg">{email.trim()}</span>, we have sent a link to reset its password. The link works once and expires after an hour.
        </p>
        <p className="text-sm text-faint">No email after a few minutes? Check spam, or request another link.</p>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={() => setSent(false)}>Send another link</Button>
          <Link href="/sign-in" className="inline-flex h-11 items-center px-4 text-[15px] text-muted hover:text-fg">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-muted">Enter the email you use for Splitmate and we will send you a link to choose a new password.</p>
      </div>
      {linkInvalid ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          That reset link is invalid or has expired. Links work once and for one hour. Request a new one below.
        </p>
      ) : null}
      <Field label="Email">
        {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" size="lg" className="w-full" busy={busy}>Send reset link</Button>
      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="font-medium text-accent-text underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
