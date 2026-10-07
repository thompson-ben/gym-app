"use client";

import { useState } from "react";
import { Button, ErrorNote } from "../ui";
import type { ButtonSize, ButtonVariant } from "../styles";

/** Opens Stripe's billing page (change card or plan, cancel, invoices). */
export function ManageBillingButton({ label = "Manage subscription", variant = "secondary", size = "md", className }: { label?: string; variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (json.url) return window.location.assign(json.url);
    setBusy(false);
    setError(json.error ?? "Couldn’t open billing. Please try again.");
  }
  return (
    <>
      <Button variant={variant} size={size} className={className} busy={busy} onClick={open}>{label}</Button>
      <ErrorNote>{error}</ErrorNote>
    </>
  );
}
