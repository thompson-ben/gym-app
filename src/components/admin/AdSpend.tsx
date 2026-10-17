import type { AdResult, AdminAdSpend } from "@/lib/admin";
import { costPer, pounds } from "@/lib/admin";
import { AdSpendEntries, AdSpendForm } from "./AdSpendForm";

/** Spend typed in from Ads Manager against what it brought: cost per sign-up, per first workout, per paying member. */
export function AdSpend({ a, manage = true }: { a: AdminAdSpend; manage?: boolean }) {
  return (
    <div className="space-y-4">
      {a.campaigns.length ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full table-fixed text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="w-[34%] py-2 pr-1 pl-3 font-medium">Campaign / ad</th>
                <th className="px-1 py-2 text-right font-medium">Spend</th>
                <th className="px-1 py-2 text-right font-medium">Sign-ups</th>
                <th className="px-1 py-2 text-right font-medium">Trained</th>
                <th className="px-1 py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {a.campaigns.map((c) => (
                <Rows key={c.campaign} name={c.campaign} r={c} ads={c.ads} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-3xl border border-dashed border-line px-5 py-5 text-sm text-muted">No spend in this range yet. Add what Ads Manager shows under Manage → Ad spend.</p>
      )}
      <p className="text-xs text-faint">
        Each cell shows the count and, underneath, the cost of each one. Sign-ups are accounts created in this range from that campaign or ad;
        Trained = logged a first workout; Paid = has paid. Days are UK days. Spend over several days is spread evenly across them.
      </p>
      {manage ? <AdSpendManage a={a} /> : null}
    </div>
  );
}

function Rows({ name, r, ads }: { name: string; r: AdResult; ads: (AdResult & { content: string })[] }) {
  return (
    <>
      <Row label={name} r={r} strong />
      {ads.map((ad) => (
        <Row key={ad.content} label={ad.content} r={ad} />
      ))}
    </>
  );
}

function Row({ label, r, strong }: { label: string; r: AdResult; strong?: boolean }) {
  const cell = (n: number) => (
    <td className="px-1 py-2 text-right align-top">
      {n}
      <span className="block text-xs text-faint">{costPer(r.spend_pence, n)}</span>
    </td>
  );
  return (
    <tr className={strong ? "border-t border-line" : undefined}>
      <td className={strong ? "py-2 pr-1 pl-3 align-top font-medium break-words" : "py-2 pr-1 pl-5 align-top text-muted break-words"}>{label}</td>
      <td className="px-1 py-2 text-right align-top">{r.spend_pence ? pounds(r.spend_pence) : "–"}</td>
      {cell(r.signups)}
      {cell(r.activated)}
      {cell(r.paid)}
    </tr>
  );
}

/** Adding and removing spend entries. */
export function AdSpendManage({ a }: { a: AdminAdSpend }) {
  return (
    <div className="space-y-4 print:hidden">
      <AdSpendForm known={a.known} />
      <AdSpendEntries entries={a.entries} />
    </div>
  );
}
