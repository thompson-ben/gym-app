import { SENTRY_DSN, sentryOptions } from "@/lib/monitoring";

// Error monitoring in the browser, only when configured. Loaded separately so it never adds
// to the app's first load.
if (SENTRY_DSN) {
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.init(sentryOptions))
    .catch(() => undefined);
}
