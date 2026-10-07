import type { Instrumentation } from "next";
import { SENTRY_DSN, sentryOptions } from "@/lib/monitoring";

export async function register() {
  if (!SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryOptions);
}

/** Server errors (pages, route handlers, the proxy) go to Sentry when it is configured. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
