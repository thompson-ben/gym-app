import { describe, expect, it } from "vitest";
import { csvField, sessionsToCsv, type ExportSession } from "@/lib/export";

const session = (over: Partial<ExportSession> = {}): ExportSession => ({
  id: "s1",
  performed_at: "2026-09-21T16:05:00Z",
  workout: "Chest & back",
  split: "My 3-day split",
  backdated: false,
  notes: null,
  exercises: [
    {
      exercise_id: "e1", name: "Incline press · Gym A", tracking_mode: "weight_reps", position: 0, skipped: false, notes: null,
      sets: [
        { position: 1, set_type: "working", weight_kg: 72.5, reps: 9, completed_at: "x" },
        { position: 0, set_type: "warmup", weight_kg: 40, reps: 10, completed_at: "x" },
        { position: 2, set_type: "working", weight_kg: 72.5, reps: 6, completed_at: "x" },
        { position: 3, set_type: "working", weight_kg: 72.5, reps: null, completed_at: null },
      ],
    },
    {
      exercise_id: "e2", name: "Dip", tracking_mode: "added_weight_reps", position: 1, skipped: false, notes: null,
      sets: [{ position: 0, set_type: "working", weight_kg: null, reps: 12, completed_at: "x" }],
    },
  ],
  ...over,
});

describe("CSV export", () => {
  it("writes one row per completed set in local time, never unconfirmed sets", () => {
    const rows = sessionsToCsv([session()], "Europe/London").replace("﻿", "").trim().split("\r\n");
    expect(rows[0]).toBe("date,time,workout,split,exercise,set_number,set_type,weight_kg,reps,weight_meaning,logged_afterwards,session_id");
    expect(rows.slice(1)).toEqual([
      "2026-09-21,17:05,Chest & back,My 3-day split,Incline press · Gym A,1,warm-up,40,10,load,no,s1",
      "2026-09-21,17:05,Chest & back,My 3-day split,Incline press · Gym A,1,working,72.5,9,load,no,s1",
      "2026-09-21,17:05,Chest & back,My 3-day split,Incline press · Gym A,2,working,72.5,6,load,no,s1",
      "2026-09-21,17:05,Chest & back,My 3-day split,Dip,1,working,0,12,added to bodyweight,no,s1",
    ]);
  });

  it("quotes commas and quotes, and neutralises formulas in names", () => {
    expect(csvField('Press, "wide"')).toBe('"Press, ""wide"""');
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("-cable fly")).toBe("'-cable fly");
    expect(csvField(-5)).toBe("-5");
    expect(csvField(null)).toBe("");
  });

  it("orders workouts oldest first and starts with a byte-order mark for Excel", () => {
    const csv = sessionsToCsv([session({ id: "b", performed_at: "2026-09-28T10:00:00Z" }), session({ id: "a" })], "UTC");
    expect(csv.startsWith("﻿date,")).toBe(true);
    expect(csv.indexOf(",a\r\n")).toBeLessThan(csv.indexOf(",b\r\n"));
  });
});
