"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminRefundWindow } from "@/lib/admin";
import { pounds } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cx } from "../styles";
import { ErrorNote } from "../ui";

/** First payments still inside the 14-day refund window: money to keep aside until it passes. */
export function RefundWindow({ w }: { w: AdminRefundWindow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function mark(id: number, refunded: boolean) {
    setError(null);
    const { error: rpcError } = await supabaseBrowser().rpc("admin_mark_refunded", { p_payment: id, p_refunded: refunded });
    if (rpcError) return setError("Couldn’t save. Please try again.");
    router.refresh();
  }
  const date = (iso: string) => formatDate(iso, "Europe/London", { year: undefined });
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">In the 14-day refund window</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{pounds(w.total_pence)}</p>
      <p className="mt-1 text-xs text-faint">
        {w.count ? `${w.count} first ${w.count === 1 ? "payment" : "payments"} that could still be refunded in full. Keep this aside until each window ends.` : "No first payments in the last 14 days."}
      </p>
      {w.payments.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {w.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className={cx("min-w-0", p.refunded_at && "text-faint line-through")}>
                <span className="font-medium tabular">{pounds(p.amount_pence)}</span>{" "}
                <span className="text-muted">
                  {p.plan ?? ""} <span className="print:hidden">· {p.email ?? "deleted account"}</span> · paid {date(p.paid_at)} · until {date(p.window_ends)}
                </span>
              </span>
              <button type="button" onClick={() => void mark(p.id, !p.refunded_at)} className="shrink-0 text-xs text-muted underline underline-offset-4 print:hidden">
                {p.refunded_at ? "Undo" : "Mark refunded"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
