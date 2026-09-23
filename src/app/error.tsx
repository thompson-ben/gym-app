"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import { buttonClass } from "@/components/styles";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe pb-safe">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        {typeof navigator !== "undefined" && !navigator.onLine
          ? "You appear to be offline. Workouts you already opened keep working; everything else needs a connection."
          : "This page could not be loaded. Your data is safe. Please try again."}
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="primary" size="lg" onClick={reset}>Try again</Button>
        <Link href="/train" className={buttonClass("secondary", "lg")}>Go to Train</Link>
      </div>
    </main>
  );
}
