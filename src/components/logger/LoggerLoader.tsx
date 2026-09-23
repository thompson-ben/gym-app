"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ensurePlannedSets } from "@/lib/session/doc";
import { loadRecord, reconcile, type LocalRecord, type LoggerSettings } from "@/lib/session/store";
import type { PreviousMap, SessionDoc } from "@/lib/types";
import { Spinner } from "../ui";

function LoggerSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted" role="status" aria-label="Loading workout">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

const Logger = dynamic(() => import("./Logger"), { ssr: false, loading: LoggerSkeleton });

/** Client-only: merges the server session with any local, not-yet-synced edits. */
function Init({ userId, server, previous, settings, timeZone }: Props) {
  const [initial] = useState<LocalRecord>(() => {
    const local = loadRecord(window.localStorage, userId, server.id);
    const record = reconcile(local, server, userId, previous, settings);
    const planned = ensurePlannedSets(record.doc, record.previous, () => crypto.randomUUID());
    return planned === record.doc ? record : { ...record, doc: planned, localVersion: record.localVersion + 1 };
  });
  return <Logger userId={userId} initial={initial} timeZone={timeZone} />;
}

const ClientInit = dynamic(() => Promise.resolve(Init), { ssr: false, loading: LoggerSkeleton });

type Props = { userId: string; server: SessionDoc; previous: PreviousMap; settings: LoggerSettings; timeZone: string };

export function LoggerLoader(props: Props) {
  return <ClientInit {...props} />;
}
