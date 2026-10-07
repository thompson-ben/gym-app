"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/monitoring";

/** Last-resort error page if the root layout itself fails. Plain HTML: no app styles load. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (navigator.onLine) reportClientError(error);
  }, [error]);
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#131416", color: "#eaebed", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#a9aeb3" }}>NotchLift couldn’t load. Your data is safe. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, height: 48, padding: "0 20px", borderRadius: 14, border: 0, background: "#c3ed89", color: "#172009", fontWeight: 600, fontSize: 16 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
