"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IconX } from "../icons";
import { Button, ErrorNote, Field, IconButton, Input } from "../ui";

/** Accounts left out of activation reporting (your own test sign-ups). Admin page only. */
export function TestAccounts({ accounts }: { accounts: { email: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(address: string, excluded: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabaseBrowser().rpc("admin_set_test_account", { p_email: address, p_excluded: excluded });
    setBusy(false);
    if (rpcError) return setError("Couldn’t save. Please try again.");
    if ((data as { result?: string } | null)?.result === "not_found") return setError(`No account uses ${address.trim()}.`);
    setEmail("");
    router.refresh();
  }

  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">Your own test sign-ups, left out of these figures. Admin accounts are always left out.</p>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void set(email, true);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label="Test account email">
            {(id) => <Input id={id} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you+test@example.com" />}
          </Field>
        </div>
        <Button type="submit" busy={busy} disabled={!email.trim()}>Exclude</Button>
      </form>
      <ErrorNote>{error}</ErrorNote>
      {accounts.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {accounts.map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{a.email}</span>
              <IconButton label={`Include ${a.email} again`} onClick={() => void set(a.email, false)}>
                <IconX size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
