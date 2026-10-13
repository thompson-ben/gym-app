import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarStrip, Funnel, StatTile } from "@/components/admin/AdminCharts";
import { FreeAccess, type FreeAccessList } from "@/components/admin/FreeAccess";
import { LaunchPanel } from "@/components/admin/LaunchPanel";
import { TestAccounts } from "@/components/admin/TestAccounts";
import { paymentsConfigured } from "@/lib/billing/server";
import { cx } from "@/components/styles";
import { PageHeader, SectionTitle } from "@/components/ui";
import { duration, pct, pounds, type AdminActivation, type AdminOverview, type AdminReferrals } from "@/lib/admin";
import { emailConfigured } from "@/lib/emails/send";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const RANGES = [7, 30, 90] as const;

const FEATURE_LABELS: [keyof AdminOverview["features"], string, string][] = [
  ["active_split", "Have an active split", "now"],
  ["targets_on", "Use targets on at least one exercise", "now"],
  ["pounds", "Track in pounds", "now"],
  ["groups_created", "Group workouts created", "in range"],
  ["group_joins", "Friends joined a group", "in range"],
  ["group_sessions", "Group workouts finished", "in range"],
  ["quick_workouts", "Quick workouts finished", "in range"],
  ["feedback", "Feedback messages", "in range"],
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: daysParam } = await searchParams;
  const days = RANGES.find((d) => String(d) === daysParam) ?? 30;
  const { supabase } = await requireUser();
  const [{ data, error }, freeList, activationRes, pricingRes, referralRes] = await Promise.all([
    supabase.rpc("admin_overview", { p_days: days }),
    supabase.rpc("admin_free_access_list"),
    supabase.rpc("admin_activation", { p_days: days }),
    supabase.rpc("admin_pricing_views", { p_days: days }),
    supabase.rpc("admin_referrals", { p_days: days }),
  ]);
  // Not an admin (or migration 13 not applied): the page does not exist for them.
  if (error || !data) notFound();
  const o = data as AdminOverview;
  const t = o.totals;
  // Missing until migration 16 runs: the section is hidden.
  const act = activationRes.data as AdminActivation | null;
  // Missing until migration 17 runs: the step is left out.
  const pricingViews = typeof pricingRes.data === "number" ? pricingRes.data : null;
  // Missing until migration 18 runs: the section is hidden.
  const referrals = referralRes.data as AdminReferrals | null;

  return (
    <>
      <PageHeader title="Admin" back={{ href: "/profile", label: "Profile" }} />
      <nav aria-label="Date range" className="-mt-2 mb-6 flex gap-2">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/admin?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={cx("h-10 rounded-full px-4 text-sm leading-10", d === days ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2 text-muted hover:text-fg")}
          >
            Last {d} days
          </Link>
        ))}
      </nav>

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3">
        <StatTile label="Visits" value={t.visits} hint="Anonymous, once per browser session" />
        <StatTile label="Sign-ups" value={t.signups} hint={`${pct(t.signups, t.visits)} of visits`} />
        <StatTile label="Logged a workout" value={t.first_workout} hint={`${pct(t.first_workout, t.signups)} of sign-ups`} />
        <StatTile label="Came back in week 2" value={t.week2_returned} hint={t.week2_eligible ? `of ${t.week2_eligible} old enough (${pct(t.week2_returned, t.week2_eligible)})` : "Needs accounts 14+ days old"} />
        <StatTile label="Active users" value={t.active_users} hint="Finished a workout in range" />
        <StatTile label="Workouts logged" value={t.workouts_logged} hint={`${t.accounts} accounts in total`} />
      </section>

      {act ? <Activation a={act} days={days} /> : null}

      <section className="mt-8" aria-labelledby="funnel-title">
        <SectionTitle><span id="funnel-title">Sign-up funnel</span></SectionTitle>
        <Funnel
          steps={[
            { label: "Visited", value: t.visits },
            ...(pricingViews == null ? [] : [{ label: "Saw pricing", value: pricingViews }]),
            { label: "Opened sign-up", value: t.signup_views },
            { label: "Created account", value: t.signups },
            { label: "Confirmed email", value: t.confirmed },
            { label: "Logged first workout", value: t.first_workout },
          ]}
        />
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="daily-title">
        <SectionTitle><span id="daily-title">Day by day</span></SectionTitle>
        <BarStrip title="Visits" unit="visits" points={o.daily.map((d) => ({ day: d.day, value: d.visits }))} />
        <BarStrip title="Sign-ups" unit="sign-ups" points={o.daily.map((d) => ({ day: d.day, value: d.signups }))} />
        <BarStrip title="Workouts logged" unit="workouts" points={o.daily.map((d) => ({ day: d.day, value: d.workouts }))} />
      </section>

      <section className="mt-8" aria-labelledby="sources-title">
        <SectionTitle><span id="sources-title">Where people come from</span></SectionTitle>
        {o.sources.length ? (
          <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-3 font-medium">Source / campaign</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Visits</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Sign-ups</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Conv.</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Trained</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular">
                {o.sources.map((s) => (
                  <tr key={`${s.source}|${s.campaign}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{s.source}</span>
                      {s.campaign ? <span className="block text-xs text-muted">{s.campaign}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">{s.visits}</td>
                    <td className="px-3 py-2.5 text-right">{s.signups}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{pct(s.signups, s.visits)}</td>
                    <td className="px-4 py-2.5 text-right">{s.first_workout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">No visits recorded in this range yet.</p>
        )}
        <details className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-fg">How to tag ad and social links</summary>
          <p className="mt-2">Add campaign tags to every link you post, so sign-ups are credited to it:</p>
          <p className="mt-2 rounded-xl bg-surface px-3 py-2 font-mono text-xs break-all text-fg">
            https://notchlift.com/?utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=launch-ppl
          </p>
          <p className="mt-2">
            Use one <code>utm_campaign</code> per ad set and <code>utm_content</code> to tell creatives apart. Facebook ad clicks without tags are still
            counted as “facebook”. Group invites and shared splits are labelled automatically. “Trained” counts sign-ups who have logged a workout.
          </p>
        </details>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MiniList title="Landing pages" rows={o.landing_pages.map((p) => [p.path, p.visits])} />
        <MiniList title="Devices" rows={Object.entries(o.devices).sort((a, b) => b[1] - a[1])} />
        <MiniList title="Countries" rows={o.countries.map((c) => [c.country === "??" ? "Unknown" : c.country, c.visits])} />
      </div>

      <section className="mt-8" aria-labelledby="features-title">
        <SectionTitle><span id="features-title">Feature use</span></SectionTitle>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {FEATURE_LABELS.map(([key, label, when]) => (
            <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>{label} <span className="text-sm text-faint">· {when}</span></span>
              <span className="font-semibold tabular">{o.features[key]}</span>
            </li>
          ))}
        </ul>
      </section>

      {referrals ? (
        <section className="mt-8" aria-labelledby="referrals-title">
          <SectionTitle><span id="referrals-title">Referrals</span></SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Signed up through a friend" value={referrals.referred} hint={`${referrals.by_link} invite link · ${referrals.by_group} group · ${referrals.by_split} split`} />
            <StatTile label="Of those, started training" value={referrals.qualified} hint={`${pct(referrals.qualified, referrals.referred)} of referred sign-ups`} />
            <StatTile label="Rewards given" value={referrals.rewards} hint="14 extra trial days, once per member" />
            <StatTile label="Referred and paying" value={referrals.referred_paid} hint={`${referrals.sharers} members have an invite link`} />
          </div>
        </section>
      ) : null}

      {o.billing ? (
        <section className="mt-8" aria-labelledby="revenue-title">
          <SectionTitle><span id="revenue-title">Revenue</span></SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Paying members" value={o.billing.paying} hint={`${o.billing.monthly} monthly · ${o.billing.yearly} yearly`} />
            <StatTileText label="Monthly recurring" value={pounds(o.billing.mrr_pence)} hint="Yearly plans counted as ÷12" />
            <StatTileText label="Collected" value={pounds(o.billing.revenue_pence)} hint={`In the last ${days} days`} />
            <StatTile label="Trials → paid" value={o.billing.trials_converted} hint={`of ${o.billing.trials_started} trials started (${pct(o.billing.trials_converted, o.billing.trials_started)})`} />
            <StatTile label="Trials running" value={o.billing.trials_active} hint={`${o.billing.trials_ended_unpaid} ended without paying`} />
            <StatTile label="Cancelling" value={o.billing.canceling} hint={o.billing.billing_issue ? `${o.billing.billing_issue} with a failed payment` : "At the end of their period"} />
          </div>
        </section>
      ) : null}

      {freeList.data ? (
        <section className="mt-8" aria-labelledby="free-title">
          <SectionTitle><span id="free-title">Free access for friends</span></SectionTitle>
          <FreeAccess list={freeList.data as FreeAccessList} emailReady={emailConfigured()} />
        </section>
      ) : null}

      {freeList.data && "live" in (freeList.data as FreeAccessList) ? (
        <section className="mt-8" aria-labelledby="launch-title">
          <SectionTitle><span id="launch-title">Launch</span></SectionTitle>
          <LaunchPanel
            live={Boolean((freeList.data as FreeAccessList).live)}
            earlyCount={(freeList.data as FreeAccessList).early?.length ?? 0}
            freeCount={(freeList.data as FreeAccessList).free.length}
            paymentsReady={paymentsConfigured()}
          />
        </section>
      ) : null}

      <section className="mt-8 mb-6" aria-labelledby="members-title">
        <SectionTitle><span id="members-title">Memberships</span></SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["founder", "trial", "paid", "lapsed"] as const).map((s) => (
            <StatTile key={s} label={s[0].toUpperCase() + s.slice(1)} value={o.memberships[s] ?? 0} />
          ))}
        </div>
        <p className="mt-3 text-sm text-faint">Figures are totals; days are UTC. No training data is shown here. Email addresses appear only in Free access and Test accounts.</p>
      </section>
    </>
  );
}

function StatTileText({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{value}</p>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

function MiniList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {rows.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="truncate">{k}</span>
              <span className="tabular text-muted">{v}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-faint">Nothing yet</p>
      )}
    </section>
  );
}

/** People who signed up in the range and how far each got. Rates are stage to stage. */
function Activation({ a, days }: { a: AdminActivation; days: number }) {
  const t = a.totals;
  const back = (n: number, of: number, d: number) => (of ? `${n} of ${of} (${pct(n, of)})` : `Needs sign-ups ${d}+ days old`);
  return (
    <section className="mt-8 space-y-4" aria-labelledby="activation-title">
      <SectionTitle><span id="activation-title">Activation</span></SectionTitle>
      <p className="-mt-2 text-sm text-muted">
        The {t.signups} people who signed up in the last {days} days. A workout counts when it has a confirmed working set; coming back means a
        workout on a later day.
      </p>
      <Funnel
        steps={[
          { label: "Signed up", value: t.signups },
          { label: "Confirmed email", value: t.confirmed },
          { label: "Activated a split", value: t.split },
          { label: "First workout", value: t.first_workout },
          { label: "Second workout, another day", value: t.second_any },
          { label: "Paid", value: t.paid },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <StatTileText label="Back within 7 days" value={pct(t.second7, t.eligible7)} hint={back(t.second7, t.eligible7, 7)} />
        <StatTileText label="Back within 14 days" value={pct(t.second14, t.eligible14)} hint={back(t.second14, t.eligible14, 14)} />
        <StatTileText label="Sign-up to first set" value={duration(t.median_minutes_to_first_set)} hint="Median, for those who logged one" />
        <StatTileText label="Trained" value={pct(t.first_workout, t.signups)} hint={`${t.first_workout} of ${t.signups} logged a workout`} />
      </div>
      {a.campaigns.length ? (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 font-medium">Source / campaign</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Sign-ups</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Split</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Trained</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Back ≤7d</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Back ≤14d</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {a.campaigns.map((c) => (
                <tr key={`${c.source}|${c.campaign}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{c.source}</span>
                    {c.campaign ? <span className="block text-xs text-muted">{c.campaign}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">{c.signups}</td>
                  <Cell n={c.split} of={c.signups} />
                  <Cell n={c.first_workout} of={c.split > 0 ? c.split : c.signups} />
                  <Cell n={c.second7} of={c.eligible7} />
                  <Cell n={c.second14} of={c.eligible14} />
                  <Cell n={c.paid} of={c.signups} last />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
            Each cell: count, then the rate from the stage before. “Back” rates only count sign-ups old enough (7 or 14 days).
          </p>
        </div>
      ) : null}
      <TestAccounts accounts={a.test_accounts} />
    </section>
  );
}

function Cell({ n, of, last }: { n: number; of: number; last?: boolean }) {
  return (
    <td className={cx("py-2.5 text-right", last ? "px-4" : "px-3")}>
      {n}
      <span className="block text-xs text-muted">{pct(n, of)}</span>
    </td>
  );
}
