import { describe, expect, it } from "vitest";
import { clearUser, getLastUser, listRecords, loadRecord, newRecord, recordKey, saveRecord, setLastUser } from "@/lib/session/store";
import { exercise, MemoryStorage, session } from "./fixtures";

describe("local session storage", () => {
  it("isolates records by authenticated user", () => {
    const storage = new MemoryStorage();
    const doc = session([exercise({ exercise_id: "incline" })]);
    saveRecord(storage, newRecord("alice", doc, {}));
    expect(loadRecord(storage, "alice", doc.id)).not.toBeNull();
    expect(loadRecord(storage, "bob", doc.id)).toBeNull();
    expect(listRecords(storage, "bob")).toEqual([]);

    // A record tampered to claim another owner is ignored.
    storage.setItem(recordKey("bob", doc.id), storage.getItem(recordKey("alice", doc.id))!);
    expect(loadRecord(storage, "bob", doc.id)).toBeNull();
  });

  it("clears only the signed-out user's data", () => {
    const storage = new MemoryStorage();
    const doc = session([]);
    saveRecord(storage, newRecord("alice", doc, {}));
    saveRecord(storage, newRecord("bob", doc, {}));
    setLastUser(storage, "alice");
    clearUser(storage, "alice");
    expect(loadRecord(storage, "alice", doc.id)).toBeNull();
    expect(loadRecord(storage, "bob", doc.id)).not.toBeNull();
    expect(getLastUser(storage)).toBeNull();
  });

  it("survives corrupt or unavailable storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(recordKey("alice", "x"), "{not json");
    expect(loadRecord(storage, "alice", "x")).toBeNull();
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem() {}, key: () => null, length: 0 };
    expect(loadRecord(broken, "alice", "x")).toBeNull();
    expect(saveRecord(broken, newRecord("alice", session([]), {}))).toBe(false);
  });
});

describe("account switching", () => {
  it("keeps another account's unsynced workout but drops its synced ones", async () => {
    const { pruneOtherUsers } = await import("@/lib/session/store");
    const storage = new MemoryStorage();
    const synced = { ...newRecord("alice", { ...session([]), id: "s1" }, {}) };
    const unsynced = { ...newRecord("alice", { ...session([]), id: "s2" }, {}), localVersion: 3, syncedVersion: 1 };
    saveRecord(storage, synced);
    saveRecord(storage, unsynced);
    saveRecord(storage, newRecord("bob", { ...session([]), id: "s3" }, {}));
    setLastUser(storage, "alice");

    expect(pruneOtherUsers(storage, "bob")).toEqual({ removed: 1, keptUnsynced: 1 });
    expect(loadRecord(storage, "alice", "s1")).toBeNull();
    expect(loadRecord(storage, "alice", "s2")).not.toBeNull();
    expect(loadRecord(storage, "bob", "s3")).not.toBeNull();
    // Bob's views only ever list Bob's records.
    expect(listRecords(storage, "bob").map((r) => r.sessionId)).toEqual(["s3"]);
  });
});
