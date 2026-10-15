import { pct, SIGNUP_ERROR_LABELS, type AdminSignupSteps } from "@/lib/admin";

/** What happened on the create-account form: what people tapped, and why sign-ups failed. */
export function SignupSteps({ s }: { s: AdminSignupSteps }) {
  const taps = s.submits + s.oauth_apple + s.oauth_google;
  const accounts = s.methods.email + s.methods.apple + s.methods.google;
  return (
    <section aria-labelledby="signup-steps-title" className="mt-3 rounded-3xl border border-line bg-surface p-4 text-sm">
      <h3 id="signup-steps-title" className="font-medium text-muted">On the sign-up form</h3>
      <ul className="mt-2 divide-y divide-line">
        <Line label="Opened it" value={s.views} hint={s.views ? `${s.views_in_app} inside the Facebook / Instagram app (${pct(s.views_in_app, s.views)})` : undefined} />
        <Line
          label="Tapped to create an account"
          value={taps}
          hint={`${s.submits} Create account · ${s.oauth_apple} Apple · ${s.oauth_google} Google${s.views ? ` · ${pct(taps, s.views)} of those who opened it` : ""}`}
        />
        <Line label="New accounts" value={accounts} hint={`${s.methods.email} email · ${s.methods.apple} Apple · ${s.methods.google} Google`} />
      </ul>
      <h4 className="mt-3 font-medium text-muted">Didn’t go through</h4>
      {s.errors.length ? (
        <ul className="mt-1 space-y-1">
          {s.errors.map((e) => (
            <li key={e.reason} className="flex justify-between gap-3">
              <span>{SIGNUP_ERROR_LABELS[e.reason] ?? e.reason}</span>
              <span className="tabular text-muted">{e.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-faint">No errors recorded</p>
      )}
      <p className="mt-3 text-xs text-faint">
        Counted once per browser tab, with no details of what was typed. Accounts exclude admins and test accounts. New in October 2026, so earlier days show none.
      </p>
    </section>
  );
}

function Line({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span>
        {label}
        {hint ? <span className="block text-xs text-faint">{hint}</span> : null}
      </span>
      <span className="font-semibold tabular">{value}</span>
    </li>
  );
}
