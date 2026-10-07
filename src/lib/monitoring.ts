/**
 * Error monitoring (Sentry) and analytics privacy helpers.
 *
 * Monitoring is off unless NEXT_PUBLIC_SENTRY_DSN is set. Reports carry no personal data:
 * no IP address, cookies, request headers, emails or user ids, and secret tokens in URLs
 * (invite links, share links, email links) are blanked before anything leaves the app.
 * Workout data is never included.
 */
import type { ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

const SECRET_PATH = /\/(join|s)\/[A-Za-z0-9_-]+/g;
const SECRET_PARAM = /([?&](?:token_hash|code|token|access_token|refresh_token|email)=)[^&#\s]*/gi;

/** Removes secrets from text that may contain URLs: invite/share tokens and auth parameters. */
export function scrubText(input: string): string {
  return input.replace(SECRET_PATH, (_m, kind: string) => `/${kind}/[token]`).replace(SECRET_PARAM, "$1[redacted]");
}

/** As scrubText, and drops the fragment (it can carry auth tokens). */
export function scrubUrl(input: string): string {
  return input ? scrubText(input).replace(/#.*$/, "") : input;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Last line of defence before an error report is sent. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.data?.url === "string") b.data.url = scrubUrl(b.data.url);
    if (typeof b.data?.from === "string") b.data.from = scrubUrl(b.data.from);
    if (typeof b.data?.to === "string") b.data.to = scrubUrl(b.data.to);
    if (b.message) b.message = scrubText(b.message.replace(EMAIL, "[email]"));
  }
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value.replace(EMAIL, "[email]"));
  }
  if (event.transaction) event.transaction = scrubText(event.transaction);
  return event;
}

export const sentryOptions = {
  dsn: SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  // Errors only: no performance tracing, no session replay.
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};

/** Reports an error caught by an error boundary (client). Loads Sentry only when configured. */
export function reportClientError(error: unknown) {
  if (!SENTRY_DSN) return;
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => undefined);
}
