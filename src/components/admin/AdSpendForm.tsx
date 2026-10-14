"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AdminAdSpend } from "@/lib/admin";
import { pounds } from "@/lib/admin";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IconTrash } from "../icons";
import { Button, ErrorNote, Field, IconButton, Input } from "../ui";

/** Yesterday as yyyy-mm-dd in UK time. */
function ukDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** Adds spend for a campaign (or one ad) over a day or a range of days. */
export function AdSpendForm({ known }: { known: AdminAdSpend["known"] }) {
  const router = useRouter();
  const campaigns = useMemo(() => [...new Set(known.map((k) => k.campaign))].sort(), [known]);
  const [start, setStart] = useState(ukDate(-1));
  const [end, setEnd] = useState(ukDate(-1));
  const [campaign, setCampaign] = useState(campaigns[0] ?? "");
  const [content, setContent] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ads = known.filter((k) => k.campaign === campaign && k.content).map((k) => k.content).sort();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const pence = Math.round(Number(amount.replace(",", ".").replace(/^£/, "")) * 100);
    if (!campaign.trim()) return setError("Enter the campaign name (utm_campaign).");
    if (!Number.isFinite(pence) || pence < 1) return setError("Enter the amount spent, e.g. 24.80.");
    if (!start || (end && end < start)) return setError("Check the dates.");
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabaseBrowser().rpc("admin_add_ad_spend", {
      p_start: start,
      p_end: end || start,
      p_campaign: campaign.trim(),
      p_content: content.trim(),
      p_amount_pence: pence,
    });
    setBusy(false);
    if (rpcError) return setError("Couldn’t save. Please try again.");
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-3xl border border-line bg-surface p-4" aria-label="Add ad spend">
      <p className="text-sm font-medium">Add spend from Ads Manager</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <Field label="Campaign" hint="As in the link's utm_campaign, e.g. signups-test-1.">
        {(id, d) => (
          <>
            <Input id={id} aria-describedby={d} list="ad-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} autoComplete="off" />
            <datalist id="ad-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Ad (optional)" hint="Leave empty for the whole campaign; or the ad's utm_content, e.g. fast-image.">
        {(id, d) => (
          <>
            <Input id={id} aria-describedby={d} list="ad-contents" value={content} onChange={(e) => setContent(e.target.value)} autoComplete="off" />
            <datalist id="ad-contents">{ads.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Amount spent (£)">
        {(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="24.80" autoComplete="off" />}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="primary" className="w-full" busy={busy}>Add spend</Button>
    </form>
  );
}

/** Recent entries, so a mistake can be removed and entered again. */
export function AdSpendEntries({ entries }: { entries: AdminAdSpend["entries"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!entries.length) return null;
  async function remove(id: number) {
    setError(null);
    const { error: rpcError } = await supabaseBrowser().rpc("admin_delete_ad_spend", { p_id: id });
    if (rpcError) return setError("Couldn’t remove it. Please try again.");
    router.refresh();
  }
  return (
    <details className="rounded-3xl border border-line bg-surface px-4 py-3 text-sm">
      <summary className="cursor-pointer text-muted">Spend entered ({entries.length})</summary>
      <ul className="mt-2 divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-medium tabular">{pounds(e.amount_pence)}</span>{" "}
              <span className="text-muted">
                {e.campaign}
                {e.content ? ` / ${e.content}` : ""} · {e.start_day === e.end_day ? e.start_day : `${e.start_day} to ${e.end_day}`}
              </span>
            </span>
            <IconButton label={`Remove ${pounds(e.amount_pence)} for ${e.campaign}`} onClick={() => void remove(e.id)}>
              <IconTrash size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
    </details>
  );
}
