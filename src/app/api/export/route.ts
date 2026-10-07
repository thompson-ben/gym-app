import { NextResponse } from "next/server";
import { sessionsToCsv, type ExportSession } from "@/lib/export";
import { requireUser, viewerTimeZone, viewerUnit } from "@/lib/supabase/server";
import type { SetType, TrackingMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE = 200;

type SessionRow = {
  id: string;
  status: string;
  template_name: string;
  split_name: string | null;
  started_at: string;
  completed_at: string | null;
  is_backdated: boolean;
  notes: string | null;
  session_exercises: {
    exercise_id: string;
    exercise_name: string;
    position: number;
    skipped: boolean;
    notes: string | null;
    target_sets: number | null;
    rep_min: number | null;
    rep_max: number | null;
    exercises: { tracking_mode: TrackingMode } | null;
    session_sets: { position: number; set_type: SetType; weight_kg: number | null; reps: number | null; completed_at: string | null }[];
  }[];
};

/**
 * Downloads the signed-in user's data. Runs as the user under RLS, so it can only ever
 * contain their own rows.
 *   ?format=csv  one row per completed set (opens in Excel / Google Sheets)
 *   ?format=json everything: profile, membership, custom exercises, splits, periods, workouts
 */
export async function GET(request: Request) {
  const { supabase, email } = await requireUser();
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";
  const [tz, unit] = await Promise.all([viewerTimeZone(), viewerUnit()]);

  const sessions: SessionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(
        "id, status, template_name, split_name, started_at, completed_at, is_backdated, notes, session_exercises(exercise_id, exercise_name, position, skipped, notes, target_sets, rep_min, rep_max, exercises(tracking_mode), session_sets(position, set_type, weight_kg, reps, completed_at))",
      )
      .in("status", ["completed", "in_progress"])
      .order("started_at", { ascending: true })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "Could not export your data. Please try again." }, { status: 500 });
    sessions.push(...(data as unknown as SessionRow[]));
    if (data.length < PAGE) break;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="notchlift-${stamp}.${ext}"`,
    "Cache-Control": "private, no-store",
  });

  if (format === "csv") {
    const completed: ExportSession[] = sessions
      .filter((s) => s.status === "completed" && s.completed_at)
      .map((s) => ({
        id: s.id,
        performed_at: s.completed_at!,
        workout: s.template_name,
        split: s.split_name,
        backdated: s.is_backdated,
        notes: s.notes,
        exercises: s.session_exercises.map((e) => ({
          exercise_id: e.exercise_id,
          name: e.exercise_name,
          tracking_mode: e.exercises?.tracking_mode ?? "weight_reps",
          position: e.position,
          skipped: e.skipped,
          notes: e.notes,
          sets: e.session_sets.map((x) => ({ ...x, weight_kg: x.weight_kg === null ? null : Number(x.weight_kg) })),
        })),
      }));
    return new NextResponse(sessionsToCsv(completed, tz, unit), { headers: headers("text/csv; charset=utf-8", "csv") });
  }

  const [profile, membership, exercises, splits] = await Promise.all([
    supabase.from("profiles").select("display_name, weight_unit, default_rest_seconds, auto_start_rest, created_at").maybeSingle(),
    supabase.from("memberships").select("status, trial_ends_at, created_at").maybeSingle(),
    supabase.from("exercises").select("id, name, variant, primary_muscle, equipment, tracking_mode, aliases, archived_at, created_at").not("owner_id", "is", null),
    supabase
      .from("splits")
      .select(
        "id, name, description, archived_at, created_at, split_active_periods(started_at, ended_at), workout_templates(id, name, position, template_exercises(position, target_sets, rep_min, rep_max, rest_seconds, notes, progression_enabled, progression_increment_kg, exercise_id))",
      )
      .order("created_at"),
  ]);
  const failed = [profile, membership, exercises, splits].find((r) => r.error);
  if (failed) return NextResponse.json({ error: "Could not export your data. Please try again." }, { status: 500 });

  const body = {
    format: "notchlift-export",
    version: 1,
    exported_at: new Date().toISOString(),
    time_zone: tz,
    account: { email },
    profile: profile.data,
    membership: membership.data,
    custom_exercises: exercises.data,
    splits: splits.data,
    workouts: sessions,
    notes: "Weights are stored and exported here in kilograms (weight_kg, progression_increment_kg), whatever display unit is chosen. Catalogue exercises are referenced by id; workout and exercise names are as they were when logged.",
  };
  return new NextResponse(JSON.stringify(body, null, 2), { headers: headers("application/json; charset=utf-8", "json") });
}
