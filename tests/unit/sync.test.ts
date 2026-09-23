import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeSet, ensurePlannedSets, toPayload, updateSet, type SyncPayload } from "@/lib/session/doc";
import { loadRecord, newRecord, reconcile, saveRecord, type LocalRecord } from "@/lib/session/store";
import { RetryableError, SessionSync, type SyncRequest, type SyncResponse, type SyncStatus } from "@/lib/session/sync";
import type { SessionDoc } from "@/lib/types";
import { exercise, MemoryStorage, seqId, session } from "./fixtures";

/** In-memory model of the sync_session SQL function's contract. */
class FakeServer {
  revision = 0;
  lastWriteId: string | null = null;
  status: "in_progress" | "discarded" = "in_progress";
  applied: SyncPayload[] = [];
  /** When set, the next request is applied but its response is "lost". */
  dropNextResponse = false;
  offline = false;

  get sets() {
    return this.applied.at(-1)?.exercises.flatMap((e) => e.sets) ?? [];
  }

  handle = async (req: SyncRequest): Promise<SyncResponse> => {
    if (this.offline) throw new RetryableError("offline");
    let response: SyncResponse;
    if (this.lastWriteId === req.writeId) response = { status: "ok", revision: this.revision };
    else if (this.status === "discarded") response = { status: "discarded" };
    else if (req.baseRevision !== this.revision) response = { status: "conflict", revision: this.revision, document: {} as SessionDoc };
    else {
      this.applied.push(structuredClone(req.payload));
      this.revision++;
      this.lastWriteId = req.writeId;
      response = { status: "ok", revision: this.revision };
    }
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new RetryableError("response lost");
    }
    return response;
  };
}

const USER = "user-a";

function setup(server: FakeServer, storage = new MemoryStorage(), online = { value: true }) {
  const statuses: SyncStatus[] = [];
  const base = ensurePlannedSets(session([exercise({ exercise_id: "incline", target_sets: 2 })]), {}, seqId);
  if (!loadRecord(storage, USER, base.id)) saveRecord(storage, newRecord(USER, base, {}));
  const transport = vi.fn(server.handle);
  const engine = new SessionSync({
    getRecord: () => loadRecord(storage, USER, base.id),
    setRecord: (r) => saveRecord(storage, r),
    transport,
    isOnline: () => online.value,
    newId: () => crypto.randomUUID(),
    onStatus: (s) => statuses.push(s),
    debounceMs: 10,
    retryMs: () => 10,
  });
  const edit = (fn: (doc: SessionDoc) => SessionDoc) => {
    const r = loadRecord(storage, USER, base.id)!;
    saveRecord(storage, { ...r, doc: fn(r.doc), localVersion: r.localVersion + 1 });
    engine.notifyChange();
  };
  const logSet = (index: number, weight: number, reps: number) =>
    edit((doc) => {
      const ex = doc.exercises[0];
      const d = updateSet(doc, ex.id, ex.sets[index].id, { weight_kg: weight, reps });
      const r = completeSet(d, ex.id, ex.sets[index].id, new Date());
      if (!("doc" in r)) throw new Error(r.error);
      return r.doc;
    });
  return { storage, engine, statuses, transport, edit, logSet, record: () => loadRecord(storage, USER, base.id) as LocalRecord, online };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SessionSync (scenario E)", () => {
  it("debounces edits into one write and reports Saved only once the server confirmed", async () => {
    const server = new FakeServer();
    const t = setup(server);
    t.logSet(0, 72.5, 9);
    t.logSet(1, 72.5, 6);
    expect(t.engine.current.kind).toBe("pending");
    await vi.advanceTimersByTimeAsync(20);
    expect(t.transport).toHaveBeenCalledTimes(1);
    expect(server.sets.map((s) => [s.weight_kg, s.reps])).toEqual([[72.5, 9], [72.5, 6]]);
    expect(t.engine.current.kind).toBe("saved");
    expect(t.record().syncedVersion).toBe(t.record().localVersion);
  });

  it("offline → reload → reconnect synchronises exactly once without losing or duplicating sets", async () => {
    const server = new FakeServer();
    const online = { value: true };
    const storage = new MemoryStorage();
    const first = setup(server, storage, online);

    online.value = false;
    first.logSet(0, 72.5, 9);
    first.logSet(1, 72.5, 6);
    await vi.advanceTimersByTimeAsync(50);
    expect(first.engine.current.kind).toBe("offline");
    expect(first.transport).not.toHaveBeenCalled();

    // Page reload: a new engine over the same persisted storage.
    first.engine.stop();
    const second = setup(server, storage, online);
    expect(second.record().doc.exercises[0].sets.filter((s) => s.completed_at)).toHaveLength(2);

    online.value = true;
    await second.engine.flush();
    await second.engine.flush();
    expect(server.applied).toHaveLength(1);
    expect(server.sets.filter((s) => s.completed_at)).toHaveLength(2);
    expect(second.engine.current.kind).toBe("saved");
  });

  it("re-sends the identical write after a lost response instead of a new one", async () => {
    const server = new FakeServer();
    const t = setup(server);
    t.logSet(0, 72.5, 9);
    server.dropNextResponse = true;
    await vi.advanceTimersByTimeAsync(11); // applied on server, response lost
    expect(t.engine.current.kind).toBe("offline");
    const pending = t.record().pending!;

    t.logSet(1, 72.5, 6); // newer edit made while the outcome was unknown
    await vi.advanceTimersByTimeAsync(100);

    const calls = t.transport.mock.calls.map(([req]) => req);
    expect(calls[1].writeId).toBe(pending.writeId);
    expect(calls[1].payload).toEqual(pending.payload);
    expect(server.applied).toHaveLength(2); // first write once, then the newer edit once
    expect(server.sets.filter((s) => s.completed_at).map((s) => s.reps)).toEqual([9, 6]);
    expect(t.engine.current.kind).toBe("saved");
  });

  it("surfaces a conflict instead of overwriting newer server data, and resolves explicitly", async () => {
    const server = new FakeServer();
    const t = setup(server);
    server.revision = 5; // another device wrote meanwhile
    t.logSet(0, 72.5, 9);
    await vi.advanceTimersByTimeAsync(20);
    expect(t.engine.current.kind).toBe("conflict");
    expect(server.applied).toHaveLength(0);

    t.engine.keepLocal();
    await vi.advanceTimersByTimeAsync(20);
    expect(server.applied).toHaveLength(1);
    expect(t.engine.current.kind).toBe("saved");
  });

  it("never resurrects a discarded session", async () => {
    const server = new FakeServer();
    const t = setup(server);
    server.status = "discarded";
    t.logSet(0, 72.5, 9);
    await vi.advanceTimersByTimeAsync(20);
    expect(t.engine.current).toEqual({ kind: "closed", reason: "discarded" });
    t.logSet(1, 70, 8);
    await vi.advanceTimersByTimeAsync(100);
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("ignores a late response after being stopped", async () => {
    const server = new FakeServer();
    const t = setup(server);
    let release!: () => void;
    t.transport.mockImplementationOnce(async (req) => {
      await new Promise<void>((r) => (release = r));
      return server.handle(req);
    });
    t.logSet(0, 72.5, 9);
    await vi.advanceTimersByTimeAsync(20);
    const before = t.record();
    t.engine.stop();
    release();
    await vi.advanceTimersByTimeAsync(20);
    expect(t.record().syncedVersion).toBe(before.syncedVersion);
  });
});

describe("reconcile", () => {
  const doc = session([exercise({ exercise_id: "incline" })]);

  it("prefers the server when there are no local changes", () => {
    const local = newRecord(USER, doc, {});
    const server = { ...doc, revision: 3, notes: "from phone" };
    expect(reconcile(local, server, USER, {}).doc.notes).toBe("from phone");
  });

  it("keeps unsynced local edits based on the current revision", () => {
    const local = { ...newRecord(USER, doc, {}), localVersion: 2, doc: { ...doc, notes: "local" } };
    expect(reconcile(local, doc, USER, {}).doc.notes).toBe("local");
  });

  it("flags a conflict when local edits are based on an older revision", () => {
    const local = { ...newRecord(USER, doc, {}), localVersion: 2 };
    const r = reconcile(local, { ...doc, revision: 4 }, USER, {});
    expect(r.conflict?.revision).toBe(4);
  });

  it("keeps the payload of a write with unknown outcome", () => {
    const local = { ...newRecord(USER, doc, {}), localVersion: 1, pending: { writeId: "w", payload: toPayload(doc), baseRevision: 0, localVersion: 1 } };
    expect(reconcile(local, { ...doc, revision: 1 }, USER, {}).pending?.writeId).toBe("w");
  });
});
