import { IconCheck } from "../icons";

/**
 * Setmodo beside the usual ways of keeping a training log. "Other apps" means workout trackers
 * in general, never one by name; keep every cell true of Setmodo as it ships.
 */
const COLUMNS = ["Notes or paper", "Spreadsheet", "Other apps"] as const;

const ROWS: { label: string; setmodo: string; others: [string, string, string] }[] = [
  { label: "What you lifted last time", setmodo: "Beside every set, already filled in", others: ["Flick back through pages", "Scroll the sheet", "Often a tap away"] },
  { label: "When to add weight", setmodo: "Your next target, worked out for you", others: ["You work it out", "Formulas you build", "Rarely says"] },
  { label: "Logging a set", setmodo: "One tap", others: ["Write it all out", "Tiny cells on a phone", "Several taps"] },
  { label: "Records and progress", setmodo: "Charts and records for every lift", others: ["None", "Charts you build", "Usually"] },
  { label: "No signal at the gym", setmodo: "Saves on your phone, syncs later", others: ["Works", "Often won’t load", "Varies"] },
  { label: "Training with friends", setmodo: "Same plan, everyone logs their own", others: ["No", "A shared sheet", "Rarely"] },
  { label: "Bringing your history", setmodo: "Import from Strong or Hevy", others: ["Type it in again", "Copy and paste", "Varies"] },
  { label: "Getting your data out", setmodo: "Spreadsheet or JSON, any time", others: ["It’s on paper", "It’s the spreadsheet", "Sometimes paid"] },
];

export function Compare({ className }: { className?: string }) {
  return (
    <section aria-labelledby="compare-title" className={className}>
      <div className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent-text uppercase">Why switch</p>
          <h2 id="compare-title" className="mt-4 text-3xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">A log that tells you what to do next.</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">Notes and spreadsheets keep the numbers. Setmodo reads them back and gives you the weight to beat.</p>
        </div>

        <table className="mt-14 block w-full text-left sm:table sm:table-fixed sm:border-separate sm:border-spacing-0">
          <thead className="sr-only sm:not-sr-only sm:table-header-group">
            <tr>
              <th scope="col" className="w-[22%] pb-4 text-sm font-medium text-muted"><span className="sr-only">Compared</span></th>
              <th scope="col" className="w-[26%] rounded-t-3xl bg-accent-soft px-5 pt-5 pb-4 text-base font-semibold text-accent-text">Setmodo</th>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-5 pb-4 text-sm font-medium text-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="block space-y-3 sm:table-row-group sm:space-y-0">
            {ROWS.map((r, i) => (
              <tr key={r.label} className="block rounded-3xl border border-line bg-surface p-5 sm:table-row sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                <th scope="row" className="block text-sm font-medium text-muted sm:table-cell sm:border-t sm:border-line sm:py-4 sm:pr-4 sm:align-top sm:text-fg">{r.label}</th>
                <td className={`mt-2 block font-semibold sm:table-cell sm:bg-accent-soft sm:px-5 sm:py-4 sm:align-top ${i === ROWS.length - 1 ? "sm:rounded-b-3xl" : ""}`}>
                  <span className="flex items-start gap-2">
                    <IconCheck size={18} className="mt-0.5 shrink-0 text-accent-text" />
                    <span>{r.setmodo}</span>
                  </span>
                </td>
                {r.others.map((o, j) => (
                  <td key={COLUMNS[j]} className="mt-1 block text-sm text-muted sm:table-cell sm:border-t sm:border-line sm:px-5 sm:py-4 sm:align-top">
                    <span className="text-faint sm:hidden">{COLUMNS[j]}: </span>
                    {o}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-center text-xs text-faint">“Other apps” means workout trackers in general, not any one app.</p>
      </div>
    </section>
  );
}
