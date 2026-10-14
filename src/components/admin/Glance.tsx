import type { AdminGlance } from "@/lib/admin";
import { pounds } from "@/lib/admin";
import { formatDate } from "@/lib/format";

/** Yesterday (UK day) and what needs attention, whatever range is selected. */
export function Glance({ g }: { g: AdminGlance }) {
  const day = formatDate(`${g.yesterday}T12:00:00Z`, "Europe/London", { weekday: "short", year: undefined });
  const attention = [
    g.trials_ending_3d ? `${g.trials_ending_3d} ${g.trials_ending_3d === 1 ? "trial ends" : "trials end"} in the next 3 days` : null,
    g.cancelling ? `${g.cancelling} ${g.cancelling === 1 ? "member is" : "members are"} cancelling` : null,
    g.billing_issues ? `${g.billing_issues} failed ${g.billing_issues === 1 ? "payment" : "payments"}` : null,
    g.new_comments ? `${g.new_comments} new ${g.new_comments === 1 ? "comment" : "comments"} in the last 24 hours` : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="glance-title" className="mb-6 rounded-3xl border border-line bg-surface p-4">
      <h2 id="glance-title" className="text-sm font-medium text-muted">Yesterday · {day}</h2>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ["Visits", String(g.visits)],
          ["Sign-ups", String(g.signups)],
          ["1st workouts", String(g.first_workouts)],
          ["Revenue", pounds(g.revenue_pence)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-faint">{label}</dt>
            <dd className="text-xl font-semibold tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{attention.length ? attention.join(" · ") : "Nothing needs attention."}</p>
    </section>
  );
}
