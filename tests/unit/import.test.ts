import { describe, expect, it } from "vitest";
import {
  ImportFileError,
  guessMode,
  guessMuscle,
  importBatches,
  matchExercise,
  parseCsv,
  parseExport,
  parseLocalDate,
  planImport,
  resolveExerciseKeys,
  splitImportedName,
  toPayloadSet,
} from "@/lib/import";
import type { Exercise } from "@/lib/types";

const ex = (id: string, name: string, equipment: string, tracking_mode: Exercise["tracking_mode"] = "weight_reps", aliases: string[] = [], owner_id: string | null = null): Exercise => ({
  id, owner_id, slug: owner_id ? null : id, name, variant: null, primary_muscle: "chest", equipment, tracking_mode, aliases, origin_exercise_id: null, archived_at: null,
});

const CATALOGUE = [
  ex("bb-bench", "Barbell Bench Press", "barbell", "weight_reps", ["bench press", "flat bench"]),
  ex("incline-bb", "Incline Barbell Bench Press", "barbell", "weight_reps", ["incline press"]),
  ex("db-bench", "Dumbbell Bench Press", "dumbbell"),
  ex("incline-db", "Incline Dumbbell Press", "dumbbell", "weight_reps", ["incline press"]),
  ex("incline-machine", "Incline Machine Chest Press", "machine", "weight_reps", ["incline press"]),
  ex("row", "Seated Cable Row", "cable", "weight_reps", ["cable row"]),
  ex("pullup", "Pull-Up", "bodyweight", "added_weight_reps", ["weighted pull-up", "pullup"]),
  ex("plank", "Plank", "bodyweight", "duration"),
  ex("squat", "Barbell Back Squat", "barbell", "weight_reps", ["squat", "back squat"]),
];

const STRONG = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  '2024-03-05 18:30:00,"Push, heavy",1h 5m,Bench Press (Barbell),W,40,10,0,0,,"Felt good",',
  "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Bench Press (Barbell),1,80,5,0,0,Paused,,8",
  "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Bench Press (Barbell),2,80,5,0,0,,,",
  "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,,,",
  "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Plank,1,0,0,0,60,,,",
  "2024-03-05 18:30:00,\"Push, heavy\",1h 5m,Running,1,0,0,5000,1500,,,",
  "2024-03-07 07:00:00,Pull,45m,Pull Up (Weighted),1,10,6,0,0,,,",
  "2024-03-07 07:00:00,Pull,45m,Cable Woodchop Thing,1,15,12,0,0,,,",
].join("\n");

const HEVY = [
  "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe",
  '"Upper A","5 Mar 2024, 18:30","5 Mar 2024, 19:30","",Seated Row (Cable),0,,0,warmup,45,12,,,',
  '"Upper A","5 Mar 2024, 18:30","5 Mar 2024, 19:30","",Seated Row (Cable),0,,1,normal,100,10,,,',
  '"Upper A","5 Mar 2024, 18:30","5 Mar 2024, 19:30","",Incline Bench Press (Barbell),0,,0,normal,135,8,,,',
  '"Upper A","5 Mar 2024, 18:30","5 Mar 2024, 19:30","",Squat (Barbell),,,0,failure,225,5,,,',
].join("\r\n");

describe("CSV", () => {
  it("reads quotes, doubled quotes, CRLF, a BOM and semicolons", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("a;b\n1,5;2\n")).toEqual([["a", "b"], ["1,5", "2"]]);
    expect(parseCsv('a,b\n"line\nbreak",2')).toEqual([["a", "b"], ["line\nbreak", "2"]]);
  });

  it("reads both apps' dates in local time", () => {
    expect(parseLocalDate("2024-03-05 18:30:00")).toEqual(new Date(2024, 2, 5, 18, 30));
    expect(parseLocalDate("5 Mar 2024, 18:30")).toEqual(new Date(2024, 2, 5, 18, 30));
    expect(parseLocalDate("15 September 2023, 07:05")).toEqual(new Date(2023, 8, 15, 7, 5));
    expect(parseLocalDate("yesterday")).toBeNull();
  });
});

describe("parsing exports", () => {
  it("groups a Strong export into workouts and exercises", () => {
    const file = parseExport(STRONG, "kg");
    expect(file.source).toBe("strong");
    expect(file.unitInFile).toBe(false);
    expect(file.workouts).toHaveLength(2);
    const [push] = file.workouts;
    expect(push.name).toBe("Push, heavy");
    expect(push.notes).toBe("Felt good");
    expect(push.entries.map((e) => e.name)).toEqual(["Bench Press (Barbell)", "Plank", "Running"]);
    const bench = push.entries[0];
    expect(bench.notes).toBe("Paused");
    // The rest timer row isn't a set.
    expect(bench.sets).toEqual([
      { warmup: true, weight: 40, reps: 10, seconds: 0, distance: 0 },
      { warmup: false, weight: 80, reps: 5, seconds: 0, distance: 0 },
      { warmup: false, weight: 80, reps: 5, seconds: 0, distance: 0 },
    ]);
  });

  it("uses the chosen unit when Strong doesn't say, and the file's when it does", () => {
    expect(parseExport(STRONG, "lb").workouts[0].entries[0].sets[1].weight).toBeCloseTo(36.287, 3);
    const labelled = STRONG.replace("Weight,", "Weight (kg),");
    const file = parseExport(labelled, "lb");
    expect(file.unitInFile).toBe(true);
    expect(file.workouts[0].entries[0].sets[1].weight).toBe(80);
  });

  it("reads a Hevy export in pounds, with warm-ups and supersets", () => {
    const file = parseExport(HEVY, "kg");
    expect(file.source).toBe("hevy");
    expect(file.unitInFile).toBe(true);
    const [w] = file.workouts;
    expect(w.startedAt).toEqual(new Date(2024, 2, 5, 18, 30));
    expect(w.entries.map((e) => [e.name, e.supersetId])).toEqual([["Seated Row (Cable)", "0"], ["Incline Bench Press (Barbell)", "0"], ["Squat (Barbell)", null]]);
    expect(w.entries[0].sets[0].warmup).toBe(true);
    expect(w.entries[0].sets[1].weight).toBeCloseTo(45.359, 3);
  });

  it("explains a file it can't read", () => {
    expect(() => parseExport("", "kg")).toThrow(ImportFileError);
    expect(() => parseExport("name,weight\nBench,80", "kg")).toThrow(/Strong or Hevy/);
  });
});

describe("matching exercises", () => {
  it("splits the equipment off an exported name", () => {
    expect(splitImportedName("Bench Press (Barbell)")).toEqual({ base: "Bench Press", equipment: "barbell", prefix: null });
    expect(splitImportedName("Triceps Pushdown (Cable - Straight Bar)").equipment).toBe("cable");
    expect(splitImportedName("Pull Up (Weighted)")).toEqual({ base: "Pull Up", equipment: null, prefix: "weighted" });
    expect(splitImportedName("Squat (Pause)").equipment).toBeNull();
  });

  it("matches clear cases, whatever the word order", () => {
    expect(matchExercise("Bench Press (Barbell)", CATALOGUE)?.id).toBe("bb-bench");
    expect(matchExercise("Incline Bench Press (Barbell)", CATALOGUE)?.id).toBe("incline-bb");
    expect(matchExercise("Seated Row (Cable)", CATALOGUE)?.id).toBe("row");
    expect(matchExercise("Pull Up (Weighted)", CATALOGUE)?.id).toBe("pullup");
    expect(matchExercise("Squat (Barbell)", CATALOGUE)?.id).toBe("squat");
    expect(matchExercise("plank", CATALOGUE)?.id).toBe("plank");
  });

  it("leaves anything ambiguous or different for a custom exercise", () => {
    // Three exercises share the alias.
    expect(matchExercise("Incline Press", CATALOGUE)).toBeNull();
    // Same name, other equipment.
    expect(matchExercise("Squat (Smith Machine)", CATALOGUE)).toBeNull();
    expect(matchExercise("Pull Up (Assisted)", CATALOGUE)).toBeNull();
  });

  it("prefers the member's own exercise with that exact name, and skips archived ones", () => {
    const own = ex("mine", "Bench Press (Barbell)", "barbell", "weight_reps", [], "user-1");
    expect(matchExercise("Bench Press (Barbell)", [...CATALOGUE, own])?.id).toBe("mine");
    expect(matchExercise("Bench Press (Barbell)", [{ ...CATALOGUE[0], archived_at: "2024-01-01" }])).toBeNull();
  });

  it("guesses muscle and tracking for new exercises", () => {
    expect(guessMuscle("Leg Curl (Machine)")).toBe("hamstrings");
    expect(guessMuscle("Overhead Triceps Extension")).toBe("triceps");
    expect(guessMuscle("Upright Row")).toBe("shoulders");
    expect(guessMuscle("Cable Woodchop Thing")).toBe("core");
    expect(guessMuscle("Sled Push")).toBe("full_body");
    const set = (weight: number | null, reps: number | null, seconds: number | null) => ({ warmup: false, weight, reps, seconds });
    expect(guessMode([set(20, 10, 0)])).toBe("weight_reps");
    expect(guessMode([set(0, 12, 0)])).toBe("bodyweight_reps");
    expect(guessMode([set(0, 0, 45)])).toBe("duration");
    expect(guessMode([set(10, 0, 30)])).toBe("added_weight_duration");
    expect(guessMode([set(0, 0, 0)])).toBeNull();
    expect(guessMode([{ ...set(0, 0, 1500), distance: 5 }])).toBeNull();
  });
});

describe("planning an import", () => {
  it("shapes sets for each tracking mode", () => {
    const s = { warmup: false, weight: 20.123456, reps: 8.4, seconds: 30 };
    expect(toPayloadSet(s, "weight_reps")).toEqual({ set_type: "working", weight_kg: 20.1235, reps: 8 });
    expect(toPayloadSet(s, "bodyweight_reps")).toEqual({ set_type: "working", weight_kg: null, reps: 8 });
    expect(toPayloadSet(s, "duration")).toEqual({ set_type: "working", weight_kg: null, reps: 30 });
    expect(toPayloadSet({ ...s, weight: null }, "weight_reps")?.weight_kg).toBe(0);
    expect(toPayloadSet({ ...s, reps: 0 }, "weight_reps")).toBeNull();
    expect(toPayloadSet({ ...s, weight: 1500 }, "weight_reps")).toBeNull();
    expect(toPayloadSet({ ...s, weight: -10 }, "added_weight_reps")).toBeNull();
  });

  it("builds workouts, new exercises and a summary", () => {
    const plan = planImport(parseExport(STRONG, "kg"), CATALOGUE, new Date(2025, 0, 1));
    expect(plan.sessions).toHaveLength(2);
    expect(plan.sets).toBe(6);
    expect(plan.skippedCardio).toEqual(["Running"]);
    expect(plan.first).toEqual(new Date(2024, 2, 5, 18, 30));
    expect(plan.newExercises).toEqual([{ key: expect.any(String), name: "Cable Woodchop Thing", primary_muscle: "core", equipment: "cable", tracking_mode: "weight_reps" }]);
    const [push, pull] = plan.sessions;
    expect(push.key).toBe("2024-03-05 18:30:00|Push, heavy");
    expect(push.exercises).toEqual([
      { exercise_id: "bb-bench", notes: "Paused", superset_next: false, sets: [
        { set_type: "warmup", weight_kg: 40, reps: 10 },
        { set_type: "working", weight_kg: 80, reps: 5 },
        { set_type: "working", weight_kg: 80, reps: 5 },
      ] },
      { exercise_id: "plank", notes: null, superset_next: false, sets: [{ set_type: "working", weight_kg: null, reps: 60 }] },
    ]);
    expect(pull.exercises[1].exercise_key).toBe(plan.newExercises[0].key);
    expect(plan.exercises.find((e) => e.name === "Bench Press (Barbell)")).toMatchObject({ match: { id: "bb-bench" }, sets: 3 });
  });

  it("links supersets and leaves out future workouts", () => {
    const plan = planImport(parseExport(HEVY, "kg"), CATALOGUE, new Date(2025, 0, 1));
    expect(plan.sessions[0].exercises.map((e) => e.superset_next)).toEqual([true, false, false]);
    expect(planImport(parseExport(HEVY, "kg"), CATALOGUE, new Date(2024, 0, 1)).sessions).toHaveLength(0);
  });

  it("sends new exercises first, then workouts in batches, then points them at the new ids", () => {
    const plan = planImport(parseExport(STRONG, "kg"), CATALOGUE, new Date(2025, 0, 1));
    const batches = importBatches(plan, 1);
    expect(batches.map((b) => [b.exercises.length, b.sessions.length])).toEqual([[1, 0], [0, 1], [0, 1]]);
    const key = plan.newExercises[0].key;
    const [, pull] = resolveExerciseKeys(plan.sessions, { [key]: "new-id" });
    expect(pull.exercises[1]).toMatchObject({ exercise_id: "new-id" });
    expect(pull.exercises[1]).not.toHaveProperty("exercise_key");
  });
});
