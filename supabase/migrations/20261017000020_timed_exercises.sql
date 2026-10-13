-- Timed exercises: static holds such as a front lever, plank or dead hang.
--
-- Two new tracking modes:
--   duration               seconds only (bodyweight holds), like bodyweight_reps
--   added_weight_duration  extra load × seconds (e.g. a weighted dead hang), like added_weight_reps
--
-- For these modes the existing columns carry seconds instead of reps:
--   session_sets.reps                   the seconds held in that set
--   template_exercises.rep_min/rep_max  the target range in seconds (e.g. 10–15)
--   (and the same columns on session_exercises and group_workout_exercises)
-- so syncing, finishing, history, previous sets and sharing work unchanged.
--
-- Additive: two allowed modes, wider limits for seconds (up to an hour) with the old limits
-- still enforced for reps, a guard so an exercise can't switch between reps and seconds once
-- it has history, and ten catalogue holds. Existing rows, ids and history are unchanged.

-- ---------------------------------------------------------------------------
-- Modes
-- ---------------------------------------------------------------------------

alter table public.exercises drop constraint if exists exercises_tracking_mode_check;
alter table public.exercises add constraint exercises_tracking_mode_check
  check (tracking_mode in ('weight_reps', 'bodyweight_reps', 'added_weight_reps', 'duration', 'added_weight_duration'));

create or replace function public.is_timed_mode(p_mode text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mode in ('duration', 'added_weight_duration');
$$;

-- Reps and seconds mean different things: once an exercise has logged sets, it can't switch
-- between them (its history would be misread). Switching within reps or within seconds is fine.
create or replace function public.guard_tracking_mode_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tracking_mode is distinct from old.tracking_mode
    and public.is_timed_mode(new.tracking_mode) <> public.is_timed_mode(old.tracking_mode)
    and exists (select 1 from public.session_exercises se where se.exercise_id = old.id) then
    raise exception 'tracking_mode_in_use' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists exercises_tracking_mode_guard on public.exercises;
create trigger exercises_tracking_mode_guard before update of tracking_mode on public.exercises
  for each row execute function public.guard_tracking_mode_change();

-- ---------------------------------------------------------------------------
-- Limits: reps stay 1–100 per range and up to 1000 per set; seconds go up to 3600
-- ---------------------------------------------------------------------------

alter table public.template_exercises drop constraint if exists template_exercises_rep_min_check;
alter table public.template_exercises drop constraint if exists template_exercises_rep_max_check;
alter table public.template_exercises add constraint template_exercises_rep_min_check check (rep_min between 1 and 3600);
alter table public.template_exercises add constraint template_exercises_rep_max_check check (rep_max between 1 and 3600);

alter table public.session_exercises drop constraint if exists session_exercises_rep_min_check;
alter table public.session_exercises drop constraint if exists session_exercises_rep_max_check;
alter table public.session_exercises add constraint session_exercises_rep_min_check check (rep_min between 1 and 3600);
alter table public.session_exercises add constraint session_exercises_rep_max_check check (rep_max between 1 and 3600);

alter table public.group_workout_exercises drop constraint if exists group_workout_exercises_rep_min_check;
alter table public.group_workout_exercises drop constraint if exists group_workout_exercises_rep_max_check;
alter table public.group_workout_exercises add constraint group_workout_exercises_rep_min_check check (rep_min between 1 and 3600);
alter table public.group_workout_exercises add constraint group_workout_exercises_rep_max_check check (rep_max between 1 and 3600);

alter table public.session_sets drop constraint if exists session_sets_reps_check;
alter table public.session_sets add constraint session_sets_reps_check check (reps between 0 and 3600);

-- Rep ranges above 100 are only allowed for timed exercises.
create or replace function public.validate_rep_range()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if greatest(coalesce(new.rep_min, 0), coalesce(new.rep_max, 0)) > 100
    and not exists (select 1 from public.exercises e where e.id = new.exercise_id and public.is_timed_mode(e.tracking_mode)) then
    raise exception 'rep_range_too_high' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists template_exercises_rep_range on public.template_exercises;
create trigger template_exercises_rep_range before insert or update of rep_min, rep_max, exercise_id
  on public.template_exercises for each row execute function public.validate_rep_range();
drop trigger if exists session_exercises_rep_range on public.session_exercises;
create trigger session_exercises_rep_range before insert or update of rep_min, rep_max, exercise_id
  on public.session_exercises for each row execute function public.validate_rep_range();
drop trigger if exists group_workout_exercises_rep_range on public.group_workout_exercises;
create trigger group_workout_exercises_rep_range before insert or update of rep_min, rep_max, exercise_id
  on public.group_workout_exercises for each row execute function public.validate_rep_range();

-- Normalises and validates set values according to the exercise's tracking mode (replaces the
-- original): seconds-only holds carry no weight; added-weight holds default to bodyweight (0);
-- reps above 1000 in a set are only allowed as seconds.
create or replace function public.validate_session_set()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text;
begin
  select e.tracking_mode into v_mode
  from public.session_exercises se
  join public.exercises e on e.id = se.exercise_id
  where se.id = new.session_exercise_id;

  if new.reps > 1000 and not public.is_timed_mode(v_mode) then
    raise exception 'reps_too_high' using errcode = '23514';
  end if;
  if v_mode in ('bodyweight_reps', 'duration') then
    new.weight_kg := null;
  elsif new.completed_at is not null and new.weight_kg is null then
    if v_mode in ('added_weight_reps', 'added_weight_duration') then
      new.weight_kg := 0;
    else
      raise exception 'completed_set_requires_weight' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trial reminder email: volume is weight × reps, so timed sets are left out of it
-- ---------------------------------------------------------------------------

create or replace function public.trial_reminders_due(p_secret text)
returns table (
  user_id uuid,
  email text,
  display_name text,
  trial_ends_at timestamptz,
  weight_unit text,
  workouts integer,
  working_sets integer,
  volume_kg numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select m.user_id, u.email::text, p.display_name, m.trial_ends_at, coalesce(p.weight_unit, 'kg'),
    (select count(*)::integer from public.workout_sessions ws where ws.user_id = m.user_id and ws.status = 'completed'),
    (select count(*)::integer from public.session_sets ss
      where ss.user_id = m.user_id and ss.completed_at is not null and ss.set_type = 'working'),
    (select coalesce(sum(ss.weight_kg * ss.reps), 0) from public.session_sets ss
      join public.session_exercises se on se.id = ss.session_exercise_id and se.user_id = ss.user_id
      join public.exercises e on e.id = se.exercise_id
      where ss.user_id = m.user_id and ss.completed_at is not null and ss.set_type = 'working'
        and not public.is_timed_mode(e.tracking_mode))
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.status = 'trial'
    and m.trial_ends_at > now() and m.trial_ends_at <= now() + interval '3 days'
    and m.trial_reminder_sent_at is null
    and u.email_confirmed_at is not null
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue: common holds (ids derived from the slug, as in the catalogue migration)
-- ---------------------------------------------------------------------------

insert into public.exercises (id, slug, name, primary_muscle, equipment, tracking_mode, aliases)
select md5('splitmate.catalogue:' || v.slug)::uuid, v.slug, v.name, v.muscle, v.equipment, v.mode, v.aliases
from (values
  ('plank', 'Plank', 'core', 'bodyweight', 'added_weight_duration', array['front plank', 'forearm plank', 'weighted plank']::text[]),
  ('side-plank', 'Side Plank', 'core', 'bodyweight', 'duration', array['side bridge']::text[]),
  ('hollow-body-hold', 'Hollow Body Hold', 'core', 'bodyweight', 'duration', array['hollow hold', 'hollow body']::text[]),
  ('l-sit', 'L-Sit', 'core', 'bodyweight', 'duration', array['l sit', 'l-sit hold']::text[]),
  ('front-lever', 'Front Lever', 'back', 'bodyweight', 'duration', array['front lever hold', 'tuck front lever']::text[]),
  ('back-lever', 'Back Lever', 'back', 'bodyweight', 'duration', array['back lever hold']::text[]),
  ('planche', 'Planche', 'shoulders', 'bodyweight', 'duration', array['planche hold', 'tuck planche']::text[]),
  ('handstand-hold', 'Handstand Hold', 'shoulders', 'bodyweight', 'duration', array['handstand', 'wall handstand']::text[]),
  ('dead-hang', 'Dead Hang', 'forearms', 'bodyweight', 'added_weight_duration', array['bar hang', 'hang', 'grip hang']::text[]),
  ('wall-sit', 'Wall Sit', 'quads', 'bodyweight', 'added_weight_duration', array['wall squat']::text[])
) as v (slug, name, muscle, equipment, mode, aliases)
on conflict (id) do nothing;
