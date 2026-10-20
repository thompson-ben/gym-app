import { CLICK_LABELS, SCROLL_ORDER, pageLabel, pct, type AdminEngagement } from "@/lib/admin";

/**
 * What visitors do before signing up (migration 28): how far down each page they scroll and
 * which buttons they tap, how many start the sign-up form, and the cookie-banner choice.
 */
export function Engagement({ e, signupViews }: { e: AdminEngagement; signupViews: number | null }) {
  const pages = [...new Set([...e.scroll.map((s) => s.path), ...e.clicks.map((c) => c.path)])].sort(
    (a, b) => (e.visits_by_page[b] ?? 0) - (e.visits_by_page[a] ?? 0),
  );
  const consent = e.consent_accepted + e.consent_declined;
  return (
    <div className="space-y-4">
      {pages.length ? (
        <ul className="space-y-3">
          {pages.map((path) => {
            const visits = e.visits_by_page[path] ?? 0;
            const scroll = SCROLL_ORDER.map((d) => [d, e.scroll.find((s) => s.path === path && s.detail === d)?.count ?? 0] as const);
            const clicks = e.clicks.filter((c) => c.path === path);
            return (
              <li key={path} className="rounded-3xl border border-line bg-surface p-4">
                <p className="font-medium">
                  {pageLabel(path)} <span className="text-sm font-normal text-muted">· {visits} {visits === 1 ? "visit" : "visits"} landed here</span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-fg">Scrolled:</span>{" "}
                  {scroll.map(([d, n]) => `${SCROLL_LABEL[d]} ${n}${visits ? ` (${pct(n, visits)})` : ""}`).join(" · ")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-fg">Tapped:</span>{" "}
                  {clicks.length ? clicks.map((c) => `${CLICK_LABELS[c.detail] ?? c.detail} ${c.count}`).join(" · ") : "nothing yet"}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No scrolling or button taps recorded in this range yet.</p>
      )}
      <p className="text-sm text-muted">
        <span className="font-medium text-fg">Sign-up form:</span> {e.signup_started} started filling it in
        {signupViews ? ` of ${signupViews} who opened it (${pct(e.signup_started, signupViews)})` : ""}.{" "}
        <span className="font-medium text-fg">Cookie banner:</span>{" "}
        {consent ? `${e.consent_accepted} accepted, ${e.consent_declined} declined (${pct(e.consent_accepted, consent)} accept; Meta only learns from those)` : "no choices yet"}.
      </p>
      <p className="text-sm text-faint">Each counted once per browser tab, with the page it happened on. Nothing typed and no ID are stored.</p>
    </div>
  );
}

const SCROLL_LABEL: Record<(typeof SCROLL_ORDER)[number], string> = { quarter: "¼", half: "½", three_quarters: "¾", bottom: "bottom" };
