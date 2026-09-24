import type { SessionDoc } from "../types";
import { toPayload, type SyncPayload } from "./doc";
import type { LocalRecord } from "./store";

export type SyncResponse =
  | { status: "ok"; revision: number }
  | { status: "conflict"; revision: number; document: SessionDoc }
  | { status: "discarded" }
  | { status: "not_found" };

export type SyncRequest = { sessionId: string; baseRevision: number; writeId: string; payload: SyncPayload };

/** Thrown by a transport when the outcome of a request is unknown (offline, timeout, 5xx). */
export class RetryableError extends Error {}

/**
 * Thrown when there is no valid session for the record's owner (signed out, expired, or a
 * different account signed in). Nothing was sent; the pending write is kept for later.
 */
export class AuthRequiredError extends Error {}

export type Transport = (request: SyncRequest) => Promise<SyncResponse>;

export type SyncStatus =
  | { kind: "saved" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "error"; message: string }
  | { kind: "conflict" }
  | { kind: "signed_out" }
  | { kind: "closed"; reason: "discarded" | "not_found" };

type Options = {
  getRecord: () => LocalRecord | null;
  setRecord: (record: LocalRecord) => void;
  transport: Transport;
  isOnline: () => boolean;
  newId: () => string;
  onStatus: (status: SyncStatus) => void;
  debounceMs?: number;
  retryMs?: (attempt: number) => number;
};

/**
 * Debounced, idempotent synchronisation of one session.
 *
 * - One request in flight at a time; edits made meanwhile are sent afterwards.
 * - Every write carries a write id. When a request's outcome is unknown the exact same write
 *   (same id, same payload) is re-sent before anything newer, so the server applies it at
 *   most once and nothing is duplicated or lost.
 * - The pending write is persisted with the record, so this also holds across reloads.
 * - Writes are based on a server revision; a mismatch is surfaced as a conflict.
 */
export class SessionSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private attempt = 0;
  private stopped = false;
  private status: SyncStatus = { kind: "saved" };

  constructor(private readonly options: Options) {}

  get current(): SyncStatus {
    return this.status;
  }

  private emit(status: SyncStatus) {
    this.status = status;
    this.options.onStatus(status);
  }

  /** Call after every local edit (the record must already be saved). */
  notifyChange() {
    if (this.stopped) return;
    if (this.status.kind !== "conflict") this.emit(this.options.isOnline() ? { kind: "pending" } : { kind: "offline" });
    this.schedule(this.options.debounceMs ?? 800);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** Sends everything outstanding. Resolves when idle (synced, offline, failed or conflicted). */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.inFlight) {
      this.inFlight = this.run().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /** Stops all activity (e.g. after discarding); late responses are ignored. */
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async run(): Promise<void> {
    for (;;) {
      if (this.stopped) return;
      let record = this.options.getRecord();
      if (!record) return;
      if (record.conflict) return this.emit({ kind: "conflict" });

      if (!record.pending) {
        if (record.localVersion <= record.syncedVersion) return this.emit({ kind: "saved" });
        record = {
          ...record,
          pending: {
            writeId: this.options.newId(),
            payload: toPayload(record.doc),
            baseRevision: record.baseRevision,
            localVersion: record.localVersion,
          },
        };
        this.options.setRecord(record);
      }

      if (!this.options.isOnline()) return this.emit({ kind: "offline" });

      const pending = record.pending!;
      this.emit({ kind: "saving" });
      let response: SyncResponse;
      try {
        response = await this.options.transport({
          sessionId: record.sessionId,
          baseRevision: pending.baseRevision,
          writeId: pending.writeId,
          payload: pending.payload,
        });
      } catch (error) {
        if (this.stopped) return;
        if (error instanceof AuthRequiredError) {
          // Keep everything; syncing resumes once the owner signs in again.
          return this.emit({ kind: "signed_out" });
        }
        if (error instanceof RetryableError) {
          // Keep the pending write untouched and retry the identical request later.
          this.attempt++;
          this.emit({ kind: "offline" });
          this.schedule(this.options.retryMs?.(this.attempt) ?? Math.min(30_000, 1000 * 2 ** this.attempt));
          return;
        }
        // The server rejected the write (the transaction rolled back, nothing applied).
        const latest = this.options.getRecord();
        if (latest) this.options.setRecord({ ...latest, pending: null });
        return this.emit({ kind: "error", message: error instanceof Error ? error.message : "Sync failed" });
      }
      if (this.stopped) return;
      this.attempt = 0;
      const latest = this.options.getRecord();
      if (!latest) return;

      if (response.status === "ok") {
        this.options.setRecord({
          ...latest,
          pending: null,
          baseRevision: response.revision,
          syncedVersion: Math.max(latest.syncedVersion, pending.localVersion),
        });
        continue;
      }
      if (response.status === "conflict") {
        this.options.setRecord({ ...latest, pending: null, conflict: { revision: response.revision, document: response.document } });
        return this.emit({ kind: "conflict" });
      }
      this.stop();
      return this.emit({ kind: "closed", reason: response.status });
    }
  }

  /** Conflict resolution: keep this device's version and overwrite the server copy. */
  keepLocal() {
    const record = this.options.getRecord();
    if (!record?.conflict) return;
    this.options.setRecord({
      ...record,
      baseRevision: record.conflict.revision,
      conflict: null,
      pending: null,
      localVersion: record.localVersion + 1,
    });
    this.emit({ kind: "pending" });
    void this.flush();
  }

  /** Conflict resolution: replace local edits with the server version. */
  useRemote(): SessionDoc | null {
    const record = this.options.getRecord();
    if (!record?.conflict) return null;
    const { document, revision } = record.conflict;
    this.options.setRecord({ ...record, doc: document, baseRevision: revision, conflict: null, pending: null, syncedVersion: record.localVersion });
    this.emit({ kind: "saved" });
    return document;
  }
}
