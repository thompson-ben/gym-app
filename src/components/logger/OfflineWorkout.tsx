"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { getLastUser, listRecords, type LocalRecord } from "@/lib/session/store";
import { buttonClass } from "../styles";
import { Spinner } from "../ui";
import { Wordmark } from "../Wordmark";

const Logger = dynamic(() => import("./Logger"), { ssr: false });

function Shell() {
  const [state] = useState<{ userId: string; record: LocalRecord } | null>(() => {
    const userId = getLastUser(window.localStorage);
    if (!userId) return null;
    const wanted = new URLSearchParams(window.location.search).get("session");
    const records = listRecords(window.localStorage, userId)
      .filter((r) => r.doc.status === "in_progress")
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const record = records.find((r) => r.sessionId === wanted) ?? records[0];
    return record ? { userId, record } : null;
  });

  if (state) {
    return <Logger userId={state.userId} initial={state.record} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} />;
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe pb-safe">
      <Wordmark />
      <h1 className="mt-8 text-2xl font-semibold">You are offline</h1>
      <p className="mt-2 text-muted">
        There is no workout on this device to continue. Splitmate needs a connection to load your splits and history. Workouts you have already opened keep working offline.
      </p>
      <Link href="/train" className={buttonClass("primary", "lg", "mt-8")}>Try again</Link>
    </main>
  );
}

const ClientShell = dynamic(() => Promise.resolve(Shell), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center text-muted"><Spinner className="h-6 w-6" /></div>
  ),
});

export function OfflineWorkout() {
  return <ClientShell />;
}
