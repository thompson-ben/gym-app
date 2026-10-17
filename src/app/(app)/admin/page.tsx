import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BarStrip, Funnel, StatTile } from "@/components/admin/AdminCharts";
import { AdSpend, AdSpendManage } from "@/components/admin/AdSpend";
import { FreeAccess, type FreeAccessList } from "@/components/admin/FreeAccess";
import { Glance } from "@/components/admin/Glance";
import { LaunchPanel } from "@/components/admin/LaunchPanel";
import { PrintButton } from "@/components/admin/PrintButton";
import { RefundWindow } from "@/components/admin/RefundWindow";
import { SignupSteps } from "@/components/admin/SignupSteps";
import { Surveys } from "@/components/admin/Surveys";
import { TestAccounts } from "@/components/admin/TestAccounts";
import { cx } from "@/components/styles";
import { PageHeader, SectionTitle } from "@/components/ui";
import {
  CHANNEL_LABELS,
  INCLUDE_KEYS,
  INCLUDE_LABELS,
  adminHref,
  decodeCampaign,
  duration,
  mergeSources,
  parseInclude,
  pct,
  pounds,
  toggleInclude,
  type AdminActivation,
  type AdminAdSpend,
  type AdminDashboard,
  type AdminGlance,
  type AdminOverview,
  type AdminRefundWindow,
  type AdminSignupSteps,
  type AdminSurveys,
  type IncludeKey,
} from "@/lib/admin";
import { emailConfigured } from "@/lib/emails/send";
import { paymentsConfigured } from "@/lib/billing/server";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const RANGES = [1, 7, 30, 90] as const;
/** "today" or "the last 7 days". Days start at midnight UTC. */
const rangeText = (days: number) => (days === 1 ? "today" : `the last ${days} days`);

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

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string; include?: string }> }) {
  const params = await searchParams;
  const days = RANGES.find((d) => String(d) === params.days) ?? 30;
  const include = parseInclude(params.include);
  const { supabase } = await requireUser();
  const [dashRes, overviewRes, freeList, activationRes, surveyRes, spendRes, refundRes, glanceRes, nudgeRes, stepsRes] = await Promise.all([
    supabase.rpc("admin_dashboard", { p_days: days, p_include: include }),
    supabase.rpc("admin_overview", { p_days: days }),
    supabase.rpc("admin_free_access_list"),
    supabase.rpc("admin_activation", { p_days: days }),
    supabase.rpc("admin_surveys", { p_days: days }),
    supabase.rpc("admin_ad_spend", { p_days: days }),
    supabase.rpc("admin_refund_window"),
    supabase.rpc("admin_glance"),
    supabase.rpc("admin_nudges", { p_days: days }),
    supabase.rpc("admin_signup_steps", { p_days: days }),
  ]);
  // Not an admin (or migration 13 not applied): the page does not exist for them.
  if (overviewRes.error || !overviewRes.data) notFound();
  const o = overviewRes.data as AdminOverview;
  // Missing until migration 24 runs: the page asks for it rather than showing mismatched figures.
  const d = dashRes.data as AdminDashboard | null;
  const act = activationRes.data as AdminActivation | null;
  const surveys = surveyRes.data as AdminSurveys | null;
  const spend = spendRes.data as AdminAdSpend | null;
  const refunds = refundRes.data as AdminRefundWindow | null;
  const glance = glanceRes.data as AdminGlance | null;
  const nudges = nudgeRes.data as { nudged: number; trained_3d: number; settled: number } | null;
  const steps = stepsRes.data as AdminSignupSteps | null;
  const free = freeList.data as FreeAccessList | null;

  return (
    <>
      <PageHeader title="Admin" back={{ href: "/profile", label: "Profile" }} action={<PrintButton />} />
      <p className="-mt-3 mb-6 hidden text-sm text-muted print:block">
        NotchLift · {days === 1 ? "Today" : `Last ${days} days`} · {countingText(include)} · generated {generatedAt()}
      </p>

      <div className="-mt-2 mb-6 space-y-3 print:hidden">
        <nav aria-label="Date range" className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={adminHref(r, include)}
              aria-current={r === days ? "page" : undefined}
              className={cx("h-10 rounded-full px-4 text-sm leading-10", r === days ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2 text-muted hover:text-fg")}
            >
              {r === 1 ? "Today" : `${r} days`}
            </Link>
          ))}
        </nav>
        {d ? (
          <div role="group" aria-label="Who is counted" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Also count:</span>
            {INCLUDE_KEYS.map((k) => {
              const on = include.includes(k);
              return (
                <Link
                  key={k}
                  href={adminHref(days, toggleInclude(include, k))}
                  aria-pressed={on}
                  className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3", on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}
                >
                  <span aria-hidden="true">{on ? "☑" : "☐"}</span>
                  {INCLUDE_LABELS[k]} <span className="text-faint tabular">({d.excluded[k]})</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {glance ? <Glance g={glance} /> : null}

      {d ? (
        <>
          <Section id="overview" title="Overview" note={`All time. ${countingText(include)}.`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Accounts" value={d.overview.accounts} />
              <StatTile label="Active this week" value={d.overview.active_7d} hint="Trained in the last 7 days" />
              <StatTile label="Workouts logged" value={d.overview.workouts_total} hint="With at least one working set" />
              <StatTile label="Paying members" value={d.overview.paying} />
              <StatTile label="Trials running" value={d.overview.trials_running} />
              <TextTile label="Monthly recurring" value={pounds(d.overview.mrr_pence)} hint="Yearly plans counted as ÷12" />
            </div>
          </Section>

          <Section id="period" title={days === 1 ? "Today" : `Last ${days} days`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Visits" value={d.period.visits} hint="Anonymous, everyone counted" />
              <StatTile label="Sign-ups" value={d.period.signups} hint={`${pct(d.period.signups, d.period.visits)} of visits`} />
              <StatTile label="First workouts" value={d.period.first_workouts} hint="People who trained for the first time" />
              <StatTile label="Workouts logged" value={d.period.workouts} hint="With at least one working set" />
              <TextTile label="Revenue collected" value={pounds(d.period.revenue_pence)} hint={`${d.period.payments} ${d.period.payments === 1 ? "payment" : "payments"}, refunds taken off`} />
              <StatTile label="Active users" value={d.period.active_users} hint="Trained at least once" />
            </div>
          </Section>

          <Section id="funnel" title="From visit to paying" note={`Visits are everyone; from “Created account” on, it’s the ${d.funnel.signups} ${d.funnel.signups === 1 ? "person" : "people"} who signed up ${rangeText(days)} and how far each has got so far.`}>
            <Funnel
              steps={[
                { label: "Visited", value: d.funnel.visits },
                { label: "Opened sign-up", value: d.funnel.signup_views },
                { label: "Created account", value: d.funnel.signups },
                { label: "Confirmed email", value: d.funnel.confirmed },
                { label: "Set up a split", value: d.funnel.split },
                { label: "First workout", value: d.funnel.first_workout },
                { label: "Paid", value: d.funnel.paid },
              ]}
            />
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium text-fg">Sign-up to first workout:</span> {d.funnel.first_workout ? `${duration(d.funnel.median_minutes_to_first)} (median)` : "–"}
              {nudges ? (
                <>
                  {" · "}
                  <span className="font-medium text-fg">First-workout email:</span>{" "}
                  {nudges.nudged ? `${nudges.nudged} sent, ${nudges.trained_3d} trained within 3 days (${pct(nudges.trained_3d, nudges.nudged)})` : "none sent"}
                </>
              ) : null}
            </p>
          </Section>

          <Section id="trials" title="Trials" note="What happened when free trials ended.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Ended" value={d.trials.ended} hint={rangeText(days)} />
              <StatTile label="Became members" value={d.trials.converted} hint={d.trials.ended ? `${pct(d.trials.converted, d.trials.ended)} of those` : undefined} />
              <StatTile label="Didn’t join" value={d.trials.ended - d.trials.converted} />
              <StatTile label="Running now" value={d.trials.running} hint={`${d.trials.ending_7d} end in the next 7 days`} />
            </div>
            <p className="mt-3 text-sm text-muted">
              All time: {d.trials.ended_all} trials ended, {d.trials.converted_all} became members ({pct(d.trials.converted_all, d.trials.ended_all)}).
              {d.trials.paid_early ? ` ${d.trials.paid_early} paid before their trial ended.` : ""}
            </p>
            {d.trials.recent.length ? (
              <ul aria-label="Recently ended trials" className="mt-3 divide-y divide-line rounded-3xl border border-line bg-surface px-4 text-sm">
                {d.trials.recent.map((t) => (
                  <li key={`${t.email}-${t.ended_at}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate print:hidden">{t.email}</span>
                      <span className="block text-xs text-faint">
                        Ended {formatDate(t.ended_at, "Europe/London", { year: undefined })} · {t.workouts} {t.workouts === 1 ? "workout" : "workouts"} logged
                      </span>
                    </span>
                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", t.converted ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted")}>
                      {t.converted ? "Member" : "Didn’t join"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section id="sources" title="Ads & where people come from">
            {spend ? (
              <section aria-label="Cost per result">
                <AdSpend a={spend} manage={false} />
              </section>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-3 font-medium">Channel</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Visits</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Sign-ups</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Trained</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular">
                  {d.channels.filter((c) => c.visits || c.signups).map((c) => (
                    <tr key={c.channel}>
                      <td className="px-4 py-2.5 font-medium">{CHANNEL_LABELS[c.channel]}</td>
                      <td className="px-3 py-2.5 text-right">{c.visits}</td>
                      <td className="px-3 py-2.5 text-right">
                        {c.signups}
                        <span className="block text-xs text-muted">{pct(c.signups, c.visits)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{c.trained}</td>
                      <td className="px-4 py-2.5 text-right">{c.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
                Sign-ups are credited to where someone first came from. Someone who saw an ad and later typed the address counts as Direct; the
                “How they heard about us” answers in More detail fill that gap.
              </p>
            </div>
          </Section>

          <Section id="sharing" title="Sharing" note={`Links members created and what they brought, ${rangeText(days)}.`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Links created" value={d.shares.invite_links + d.shares.split_links + d.shares.group_invites} hint={`${d.shares.invite_links} invite · ${d.shares.split_links} split · ${d.shares.group_invites} group`} />
              <StatTile label="Visits from shares" value={d.shares.visits.link + d.shares.visits.split + d.shares.visits.group} hint={`${d.shares.visits.link} invite · ${d.shares.visits.split} split · ${d.shares.visits.group} group`} />
              <StatTile label="Signed up via a share" value={d.shares.signups} hint={`${d.shares.trained} trained · ${d.shares.paid} paid`} />
              <StatTile label="Trials extended" value={d.shares.rewards} hint="+14 days for a friend who trained" />
            </div>
          </Section>

          <Section id="money" title="Money">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Paying members" value={d.overview.paying} hint={o.billing ? `${o.billing.monthly} monthly · ${o.billing.yearly} yearly` : undefined} />
              <TextTile label="Monthly recurring" value={pounds(d.overview.mrr_pence)} hint="Yearly plans counted as ÷12" />
              <TextTile label="Collected" value={pounds(d.period.revenue_pence)} hint={days === 1 ? "Today" : `In the last ${days} days`} />
              {o.billing ? (
                <StatTile label="Cancelling" value={o.billing.canceling} hint={o.billing.billing_issue ? `${o.billing.billing_issue} with a failed payment` : "At the end of their period"} />
              ) : null}
            </div>
            {refunds ? (
              <section aria-label="Refund window" className="mt-3">
                <RefundWindow w={refunds} />
              </section>
            ) : null}
          </Section>
        </>
      ) : (
        <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-muted">Run migration 24 to see the dashboard.</p>
      )}

      <details className="mt-10 rounded-3xl border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer py-1 font-medium">More detail</summary>
        <p className="mt-1 text-sm text-faint">
          Charts and breakdowns behind the figures above. These always leave out admins and test accounts, and count everyone else. Only prints if
          opened.
        </p>

        {d ? (
          <Sub title="Day by day">
            <div className="space-y-4">
              <BarStrip title="Visits" unit="visits" points={d.daily.map((x) => ({ day: x.day, value: x.visits }))} />
              <BarStrip title="Sign-ups" unit="sign-ups" points={d.daily.map((x) => ({ day: x.day, value: x.signups }))} />
              <BarStrip title="Workouts logged" unit="workouts" points={d.daily.map((x) => ({ day: x.day, value: x.workouts }))} />
            </div>
          </Sub>
        ) : null}

        {steps ? (
          <Sub title="The sign-up form">
            <SignupSteps s={steps} />
          </Sub>
        ) : null}

        {act?.campaigns.length ? (
          <Sub title="Activation by campaign">
            <CampaignTable a={act} />
          </Sub>
        ) : null}

        <Sub title="Every source and campaign">
          <SourcesTable rows={mergeSources(o.sources)} />
        </Sub>

        <Sub title="Pages, devices and countries">
          <div className="grid gap-4 sm:grid-cols-3">
            <MiniList title="Landing pages" rows={o.landing_pages.map((p) => [p.path, p.visits])} />
            <MiniList title="Devices" rows={Object.entries(o.devices).sort((a, b) => b[1] - a[1])} />
            <MiniList title="Countries" rows={o.countries.map((c) => [c.country === "??" ? "Unknown" : c.country, c.visits])} />
          </div>
        </Sub>

        <Sub title="Feature use">
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {FEATURE_LABELS.map(([key, label, when]) => (
              <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>{label} <span className="text-sm text-faint">· {when}</span></span>
                <span className="font-semibold tabular">{o.features[key]}</span>
              </li>
            ))}
          </ul>
        </Sub>

        {surveys ? (
          <Sub title="Feedback">
            <Surveys s={surveys} />
          </Sub>
        ) : null}

        <Sub title="Memberships">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["founder", "trial", "paid", "lapsed"] as const).map((s) => (
              <StatTile key={s} label={s[0].toUpperCase() + s.slice(1)} value={o.memberships[s] ?? 0} />
            ))}
          </div>
          <p className="mt-2 text-sm text-faint">Everyone, including admins and friends. Founders have free access.</p>
        </Sub>
      </details>

      <details className="mt-4 mb-6 rounded-3xl border border-line bg-surface px-4 py-3 print:hidden">
        <summary className="cursor-pointer py-1 font-medium">Manage</summary>
        {spend ? (
          <Sub title="Ad spend">
            <AdSpendManage a={spend} />
          </Sub>
        ) : null}
        {free ? (
          <Sub title="Free access for friends">
            <FreeAccess list={free} emailReady={emailConfigured()} />
          </Sub>
        ) : null}
        {act ? (
          <Sub title="Test accounts">
            <TestAccounts accounts={act.test_accounts} />
          </Sub>
        ) : null}
        {free && "live" in free ? (
          <Sub title="Launch">
            <LaunchPanel live={Boolean(free.live)} earlyCount={free.early?.length ?? 0} freeCount={free.free.length} paymentsReady={paymentsConfigured()} />
          </Sub>
        ) : null}
        <p className="mt-4 text-sm text-faint">Email addresses appear only in Trials, Refund window, Feedback comments and here, and are left out of the PDF.</p>
      </details>
    </>
  );
}

function countingText(include: readonly IncludeKey[]): string {
  if (!include.length) return "Customers only (no admins, friends or test accounts)";
  return `Including ${include.map((k) => INCLUDE_LABELS[k].toLowerCase()).join(" and ")}`;
}

/** e.g. "15 Oct 2026, 09:12" in UK time. */
function generatedAt() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8" aria-labelledby={`${id}-title`}>
      <SectionTitle><span id={`${id}-title`}>{title}</span></SectionTitle>
      {note ? <p className="-mt-1 mb-3 text-sm text-muted">{note}</p> : null}
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="mb-3 text-sm font-medium tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function TextTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
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
    <section className="rounded-3xl border border-line bg-bg p-4">
      <h4 className="text-sm font-medium text-muted">{title}</h4>
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

function SourcesTable({ rows }: { rows: AdminOverview["sources"] }) {
  if (!rows.length) return <p className="text-sm text-faint">No visits recorded in this range yet.</p>;
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-bg">
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 font-medium">Source / campaign</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Visits</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Sign-ups</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Trained</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular">
          {rows.map((s) => (
            <tr key={`${s.source}|${s.campaign}`}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{s.source}</span>
                {s.campaign ? <span className="block text-xs text-muted">{s.campaign}</span> : null}
              </td>
              <td className="px-3 py-2.5 text-right">{s.visits}</td>
              <td className="px-3 py-2.5 text-right">{s.signups}</td>
              <td className="px-4 py-2.5 text-right">{s.first_workout}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
        Tag links with <code>utm_source</code>, <code>utm_medium</code> and <code>utm_campaign</code> so they’re credited, e.g.{" "}
        <code className="break-all">notchlift.com/?utm_source=instagram&amp;utm_medium=story&amp;utm_campaign=train-together</code>.
      </p>
    </div>
  );
}

/** Sign-ups in the range by campaign and how far each got. Rates are stage to stage. */
function CampaignTable({ a }: { a: AdminActivation }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-bg">
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
                {c.campaign ? <span className="block text-xs text-muted">{decodeCampaign(c.campaign)}</span> : null}
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
