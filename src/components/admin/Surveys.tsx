import type { AdminSurveys } from "@/lib/admin";
import { pct } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { SURVEY_TITLES, answerLabel } from "@/lib/surveys";

const ORDER = ["heard_from", "trial_pulse", "trial_exit", "cancel_reason"];

/** Answers to the one-question surveys: totals per question, by ad, and the latest comments. */
export function Surveys({ s }: { s: AdminSurveys }) {
  const groups = new Map<string, { source: string; campaign: string; content: string; rows: { answer: string; count: number }[] }>();
  for (const r of s.by_campaign) {
    const key = `${r.question}|${r.source}|${r.campaign}|${r.content}`;
    const g = groups.get(key) ?? { source: r.source, campaign: r.campaign, content: r.content, rows: [] };
    g.rows.push({ answer: r.answer, count: r.count });
    groups.set(key, g);
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((q) => {
          const rows = s.answers.filter((a) => a.question === q);
          const answered = rows.filter((a) => a.answer !== "skipped");
          const total = answered.reduce((n, a) => n + a.count, 0);
          const skipped = rows.find((a) => a.answer === "skipped")?.count ?? 0;
          return (
            <section key={q} className="rounded-3xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium text-muted">{SURVEY_TITLES[q]}</h3>
              {answered.length ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {answered.map((a) => (
                    <li key={a.answer} className="flex justify-between gap-3">
                      <span className="truncate">{answerLabel(q, a.answer)}</span>
                      <span className="tabular text-muted">{a.count} · {pct(a.count, total)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-faint">No answers yet</p>
              )}
              {skipped ? <p className="mt-2 text-xs text-faint">{skipped} skipped</p> : null}
            </section>
          );
        })}
      </div>

      {groups.size ? (
        <section className="rounded-3xl border border-line bg-surface p-4">
          <h3 className="text-sm font-medium text-muted">By campaign and ad</h3>
          <ul className="mt-2 space-y-3 text-sm">
            {[...groups.entries()].map(([key, g]) => (
              <li key={key}>
                <p className="font-medium">
                  {[g.source, g.campaign, g.content].filter(Boolean).join(" / ")}
                  <span className="font-normal text-muted"> · {SURVEY_TITLES[key.split("|")[0]]}</span>
                </p>
                <p className="text-muted">{g.rows.map((r) => `${answerLabel(key.split("|")[0], r.answer)} ${r.count}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-3xl border border-line bg-surface p-4">
        <h3 className="text-sm font-medium text-muted">Latest comments</h3>
        {s.comments.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {s.comments.map((c, i) => (
              <li key={`${c.at}-${i}`} className="py-3 first:pt-1 last:pb-0">
                <p className="text-xs text-faint">
                  {formatDate(c.at, "Europe/London", { day: "numeric", month: "short", year: undefined })} · {SURVEY_TITLES[c.question]} · {answerLabel(c.question, c.answer)}
                  {c.campaign ? ` · ${c.source} / ${c.campaign}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line">{c.detail}</p>
                <a href={`mailto:${c.email}`} className="mt-1 inline-block text-accent-text underline-offset-4 hover:underline">{c.email}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-faint">Nothing written yet</p>
        )}
      </section>
    </div>
  );
}
