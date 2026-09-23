import type { PreviousMap, SessionDoc } from "../types";
import type { SyncPayload } from "./doc";

/**
 * Local persistence of in-progress sessions. Every record is namespaced by the
 * authenticated user id so one account can never load another account's local data.
 */

export type PendingWrite = {
  writeId: string;
  payload: SyncPayload;
  baseRevision: number;
  localVersion: number;
};

export type LocalRecord = {
  v: 1;
  userId: string;
  sessionId: string;
  doc: SessionDoc;
  /** Server revision the local doc is based on. */
  baseRevision: number;
  /** Incremented on every local edit. */
  localVersion: number;
  /** localVersion known to be stored on the server. */
  syncedVersion: number;
  /** A write that was sent (or is about to be) and whose outcome is not yet known. */
  pending: PendingWrite | null;
  conflict: { revision: number; document: SessionDoc } | null;
  previous: PreviousMap;
  rest: { startedAt: number; duration: number } | null;
  settings: LoggerSettings;
  updatedAt: number;
};

export type LoggerSettings = { defaultRestSeconds: number; autoStartRest: boolean };
export const DEFAULT_SETTINGS: LoggerSettings = { defaultRestSeconds: 120, autoStartRest: false };

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "splitmate:v1:";
const LAST_USER_KEY = `${PREFIX}last-user`;

export const recordKey = (userId: string, sessionId: string) => `${PREFIX}${userId}:session:${sessionId}`;

export function loadRecord(storage: KeyValueStorage, userId: string, sessionId: string): LocalRecord | null {
  try {
    const raw = storage.getItem(recordKey(userId, sessionId));
    if (!raw) return null;
    const record = JSON.parse(raw) as LocalRecord;
    return record.v === 1 && record.userId === userId && record.sessionId === sessionId ? record : null;
  } catch {
    return null;
  }
}

export function saveRecord(storage: KeyValueStorage, record: LocalRecord): boolean {
  try {
    storage.setItem(recordKey(record.userId, record.sessionId), JSON.stringify({ ...record, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function removeRecord(storage: KeyValueStorage, userId: string, sessionId: string) {
  try {
    storage.removeItem(recordKey(userId, sessionId));
  } catch {
    /* storage unavailable */
  }
}

function userKeys(storage: KeyValueStorage, userId: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(`${PREFIX}${userId}:`)) keys.push(key);
  }
  return keys;
}

export function listRecords(storage: KeyValueStorage, userId: string): LocalRecord[] {
  try {
    return userKeys(storage, userId)
      .map((key) => {
        const sessionId = key.split(":session:")[1];
        return sessionId ? loadRecord(storage, userId, sessionId) : null;
      })
      .filter((r): r is LocalRecord => r !== null);
  } catch {
    return [];
  }
}

export const hasUnsyncedChanges = (record: LocalRecord) =>
  record.pending !== null || record.localVersion > record.syncedVersion || record.conflict !== null;

/** Removes all local Splitmate data of one user (used on sign-out). */
export function clearUser(storage: KeyValueStorage, userId: string) {
  try {
    for (const key of userKeys(storage, userId)) storage.removeItem(key);
    if (storage.getItem(LAST_USER_KEY) === userId) storage.removeItem(LAST_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function setLastUser(storage: KeyValueStorage, userId: string) {
  try {
    storage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* storage unavailable */
  }
}

export function getLastUser(storage: KeyValueStorage): string | null {
  try {
    return storage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

export function newRecord(userId: string, doc: SessionDoc, previous: PreviousMap, settings: LoggerSettings = DEFAULT_SETTINGS): LocalRecord {
  return {
    v: 1,
    userId,
    sessionId: doc.id,
    doc,
    baseRevision: doc.revision,
    localVersion: 0,
    syncedVersion: 0,
    pending: null,
    conflict: null,
    previous,
    rest: null,
    settings,
    updatedAt: Date.now(),
  };
}

/**
 * Chooses what to show when the logger opens: the server copy, or local edits that have not
 * reached the server yet. Local edits based on an older revision become a conflict that the
 * user resolves explicitly rather than being silently dropped or silently overwriting.
 */
export function reconcile(
  local: LocalRecord | null,
  server: SessionDoc,
  userId: string,
  previous: PreviousMap,
  settings: LoggerSettings = DEFAULT_SETTINGS,
): LocalRecord {
  if (!local) return newRecord(userId, server, previous, settings);
  const merged = { ...local, settings, previous: { ...local.previous, ...previous } };
  if (!hasUnsyncedChanges(local)) {
    return { ...merged, doc: server, baseRevision: server.revision, localVersion: local.localVersion, syncedVersion: local.localVersion, conflict: null };
  }
  if (local.pending) {
    // Outcome of the last write is unknown; the sync engine re-sends it with the same write id.
    return merged;
  }
  if (server.revision !== local.baseRevision) {
    return { ...merged, conflict: { revision: server.revision, document: server } };
  }
  return merged;
}
