"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasUnsyncedChanges, recordKey, saveRecord, type LocalRecord } from "@/lib/session/store";
import { RetryableError, SessionSync, type SyncResponse, type SyncStatus, type Transport } from "@/lib/session/sync";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError, isRetryable } from "@/lib/supabase/errors";
import type { SessionDoc } from "@/lib/types";

const transport: Transport = async ({ sessionId, baseRevision, writeId, payload }) => {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new RetryableError("offline");
  let result;
  try {
    result = await supabaseBrowser().rpc("sync_session", {
      p_session_id: sessionId,
      p_base_revision: baseRevision,
      p_write_id: writeId,
      p_doc: payload,
    });
  } catch (error) {
    throw new RetryableError(error instanceof Error ? error.message : "network");
  }
  if (result.error) {
    if (isRetryable(result.error, result.status)) throw new RetryableError(result.error.message);
    throw new Error(friendlyError(result.error, "The server rejected this change."));
  }
  return result.data as SyncResponse;
};

export function useSessionRecord(userId: string, initial: LocalRecord) {
  const [record, setRecord] = useState(initial);
  const recordRef = useRef(initial);
  const engineRef = useRef<SessionSync | null>(null);
  const [status, setStatus] = useState<SyncStatus>(
    initial.conflict ? { kind: "conflict" } : hasUnsyncedChanges(initial) ? { kind: "pending" } : { kind: "saved" },
  );
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [storageFailed, setStorageFailed] = useState(false);

  const persist = useCallback((next: LocalRecord) => {
    recordRef.current = next;
    setRecord(next);
    setStorageFailed(!saveRecord(window.localStorage, next));
  }, []);

  useEffect(() => {
    persist(recordRef.current);
    const engine = new SessionSync({
      getRecord: () => recordRef.current,
      setRecord: persist,
      transport,
      isOnline: () => navigator.onLine,
      newId: () => crypto.randomUUID(),
      onStatus: setStatus,
    });
    engineRef.current = engine;
    if (recordRef.current.conflict) setStatus({ kind: "conflict" });
    else if (hasUnsyncedChanges(recordRef.current)) void engine.flush();

    const goOnline = () => {
      setOnline(true);
      void engine.flush();
    };
    const goOffline = () => {
      setOnline(false);
      if (hasUnsyncedChanges(recordRef.current)) setStatus({ kind: "offline" });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void engine.flush();
    };
    // Another tab edited the same session: adopt its newer copy rather than overwrite it.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== recordKey(userId, recordRef.current.sessionId) || !e.newValue) return;
      try {
        const other = JSON.parse(e.newValue) as LocalRecord;
        if (other.userId === userId && other.localVersion >= recordRef.current.localVersion) {
          recordRef.current = other;
          setRecord(other);
        }
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      engine.stop();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist, userId]);

  /** Applies an edit to the session document: stored locally at once, synced debounced. */
  const edit = useCallback(
    (fn: (doc: SessionDoc) => SessionDoc) => {
      const current = recordRef.current;
      const doc = fn(current.doc);
      if (doc === current.doc) return;
      persist({ ...current, doc, localVersion: current.localVersion + 1 });
      engineRef.current?.notifyChange();
    },
    [persist],
  );

  /** Updates non-synced local state (rest timer, cached previous performance, settings). */
  const patch = useCallback((changes: Partial<LocalRecord>) => persist({ ...recordRef.current, ...changes }), [persist]);

  return { record, recordRef, status, online, storageFailed, edit, patch, engine: engineRef };
}
