import type { TrackingMode } from "./types";

/** A group workout as returned by group_workout_document() (members only). */
export type GroupExercise = {
  id: string;
  exercise_id: string;
  name: string;
  variant: string | null;
  tracking_mode: TrackingMode;
  custom: boolean;
  position: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  notes: string | null;
};

export type GroupMemberStatus = "joined" | "in_progress" | "completed";

export type GroupMember = { display_name: string; role: "host" | "member"; status: GroupMemberStatus; is_me: boolean; member_key: string };

export type GroupDoc = {
  id: string;
  name: string;
  planned_for: string | null;
  is_host: boolean;
  invite_token: string | null;
  created_at: string;
  exercises: GroupExercise[];
  members: GroupMember[];
  my_session: { id: string; status: "in_progress" | "completed" } | null;
};

/** What an invite link shows before joining. */
export type GroupInvitePreview = {
  name: string;
  planned_for: string | null;
  host_name: string | null;
  member_count: number;
  group_id: string | null;
  exercises: { name: string; target_sets: number; rep_min: number | null; rep_max: number | null }[];
};

export const MEMBER_STATUS_LABEL: Record<GroupMemberStatus, string> = {
  joined: "Joined",
  in_progress: "Training",
  completed: "Finished",
};

export const groupExerciseLabel = (e: Pick<GroupExercise, "name" | "variant">) => (e.variant ? `${e.name} · ${e.variant}` : e.name);

export const isInviteToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);
