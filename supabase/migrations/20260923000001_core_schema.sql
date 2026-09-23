-- Splitmate core schema.
--
-- Two independent hierarchies:
--   user -> splits -> workout_templates -> template_exercises (plans + targets)
--   user -> workout_sessions -> session_exercises -> session_sets (what actually happened)
--
-- Performance history is keyed by (user_id, exercise_id) only. Templates never own history,
-- and sessions keep their own snapshot of names and targets so editing or deleting a
-- template never alters or removes completed training.
--
-- Ownership integrity: child rows carry user_id and reference their parent through a
-- composite (id, user_id) foreign key, so a row can only ever point at a parent owned by
-- the same user, regardless of which ids a client submits.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  -- Weights are always stored in kilograms. Only kg is offered in V1.
  weight_unit text not null default 'kg' check (weight_unit in ('kg')),
  default_rest_seconds integer not null default 120 check (default_rest_seconds between 15 and 900),
  auto_start_rest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Exercises: curated catalogue (owner_id is null) and user-created custom exercises.
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  slug text unique,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Distinguishes e.g. a specific gym's machine without merging it into a generic exercise.
  variant text check (variant is null or char_length(btrim(variant)) between 1 and 80),
  primary_muscle text not null check (primary_muscle in (
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings',
    'glutes', 'adductors', 'calves', 'core', 'full_body')),
  equipment text not null check (equipment in (
    'barbell', 'dumbbell', 'machine', 'cable', 'smith_machine', 'bodyweight', 'kettlebell',
    'ez_bar', 'trap_bar', 'band', 'other')),
  -- weight_reps: load x reps. bodyweight_reps: reps only. added_weight_reps: extra load on
  -- top of bodyweight (e.g. weighted dips), where 0 means bodyweight only.
  tracking_mode text not null default 'weight_reps'
    check (tracking_mode in ('weight_reps', 'bodyweight_reps', 'added_weight_reps')),
  aliases text[] not null default '{}',
  -- Provenance for custom exercises created from a shared split. Deliberately not a foreign
  -- key: it may reference another user's private exercise, which the recipient cannot read.
  origin_exercise_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_catalogue_has_slug check ((owner_id is null) = (slug is not null))
);

create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

-- A template or session row may only reference catalogue exercises or the same user's
-- custom exercises.
create or replace function public.assert_exercise_usable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.exercises where id = new.exercise_id;
  if not found or (v_owner is not null and v_owner <> new.user_id) then
    raise exception 'exercise_not_available' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Splits and activation periods
-- ---------------------------------------------------------------------------

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  archived_at timestamptz,
  -- Provenance only (the share belongs to another user); not a foreign key.
  copied_from_share_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index splits_user_idx on public.splits (user_id, created_at);
create trigger splits_updated_at before update on public.splits
  for each row execute function public.set_updated_at();

create table public.split_active_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  split_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (split_id, user_id) references public.splits (id, user_id) on delete cascade,
  constraint period_range_valid check (ended_at is null or ended_at > started_at),
  -- No two periods of the same user may overlap in time.
  constraint periods_no_overlap exclude using gist (
    user_id with =,
    tstzrange(started_at, ended_at, '[)') with &&
  )
);

-- At most one open (active) period per user.
create unique index split_active_periods_one_open on public.split_active_periods (user_id)
  where ended_at is null;
create index split_active_periods_split_idx on public.split_active_periods (split_id, started_at);

create or replace function public.validate_active_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '1 minute' then
    raise exception 'period_starts_in_future' using errcode = '22023';
  end if;
  if new.ended_at is not null and new.ended_at > now() + interval '1 minute' then
    raise exception 'period_ends_in_future' using errcode = '22023';
  end if;
  if new.ended_at is null and exists (
    select 1 from public.splits s where s.id = new.split_id and s.archived_at is not null
  ) then
    raise exception 'split_archived' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger split_active_periods_validate before insert or update on public.split_active_periods
  for each row execute function public.validate_active_period();

-- ---------------------------------------------------------------------------
-- Workout templates
-- ---------------------------------------------------------------------------

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  split_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (split_id, user_id) references public.splits (id, user_id) on delete cascade
);

create index workout_templates_split_idx on public.workout_templates (split_id, position);
create trigger workout_templates_updated_at before update on public.workout_templates
  for each row execute function public.set_updated_at();

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null default 0,
  target_sets smallint not null default 2 check (target_sets between 1 and 20),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  rest_seconds integer check (rest_seconds between 15 and 900),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (template_id, user_id) references public.workout_templates (id, user_id) on delete cascade,
  constraint template_rep_range_valid check (rep_min is null or rep_max is null or rep_min <= rep_max)
);

create index template_exercises_template_idx on public.template_exercises (template_id, position);
create index template_exercises_exercise_idx on public.template_exercises (exercise_id);
create trigger template_exercises_updated_at before update on public.template_exercises
  for each row execute function public.set_updated_at();
create trigger template_exercises_exercise_usable before insert or update of exercise_id, user_id
  on public.template_exercises for each row execute function public.assert_exercise_usable();

-- ---------------------------------------------------------------------------
-- Workout sessions (actual training)
-- ---------------------------------------------------------------------------

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Source references are nullable so deleting a template or split never deletes history.
  split_id uuid,
  template_id uuid,
  split_name text,
  template_name text not null check (char_length(btrim(template_name)) between 1 and 60),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'discarded')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  -- Optimistic concurrency for autosave; bumped on every accepted write.
  revision integer not null default 0,
  -- Idempotency key of the last accepted sync write.
  last_write_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (split_id, user_id) references public.splits (id, user_id) on delete set null (split_id),
  foreign key (template_id, user_id) references public.workout_templates (id, user_id)
    on delete set null (template_id),
  constraint session_completion_consistent check ((status = 'completed') = (completed_at is not null))
);

-- One unfinished session per user prevents accidental duplicate workouts.
create unique index workout_sessions_one_in_progress on public.workout_sessions (user_id)
  where status = 'in_progress';
create index workout_sessions_history_idx on public.workout_sessions (user_id, status, completed_at desc);
create index workout_sessions_split_idx on public.workout_sessions (split_id, completed_at);
create trigger workout_sessions_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create or replace function public.guard_session_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'discarded' then
    raise exception 'session_discarded' using errcode = '22023';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'session_already_completed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger workout_sessions_guard_status before update on public.workout_sessions
  for each row execute function public.guard_session_status();

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  template_exercise_id uuid,
  position integer not null default 0,
  -- Snapshot of what the session was planned as when it started.
  exercise_name text not null check (char_length(btrim(exercise_name)) between 1 and 120),
  target_sets smallint check (target_sets between 1 and 20),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  rest_seconds integer check (rest_seconds between 15 and 900),
  template_notes text check (template_notes is null or char_length(template_notes) <= 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade,
  foreign key (template_exercise_id, user_id) references public.template_exercises (id, user_id)
    on delete set null (template_exercise_id)
);

create index session_exercises_history_idx on public.session_exercises (user_id, exercise_id);
create index session_exercises_session_idx on public.session_exercises (session_id, position);
create trigger session_exercises_exercise_usable before insert or update of exercise_id, user_id
  on public.session_exercises for each row execute function public.assert_exercise_usable();

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_exercise_id uuid not null,
  position integer not null default 0,
  set_type text not null default 'working' check (set_type in ('working', 'warmup')),
  -- Load in kg. For added_weight_reps exercises this is the added load only.
  weight_kg numeric(6, 2) check (weight_kg between 0 and 1000),
  reps smallint check (reps between 0 and 1000),
  -- A set is performed only once explicitly confirmed. Unconfirmed rows are drafts.
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_exercise_id, user_id) references public.session_exercises (id, user_id)
    on delete cascade,
  constraint completed_set_has_reps check (completed_at is null or reps >= 1)
);

create index session_sets_exercise_idx on public.session_sets (session_exercise_id, position);
create trigger session_sets_updated_at before update on public.session_sets
  for each row execute function public.set_updated_at();

-- Normalises and validates set values according to the exercise's tracking mode.
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

  if v_mode = 'bodyweight_reps' then
    new.weight_kg := null;
  elsif new.completed_at is not null and new.weight_kg is null then
    if v_mode = 'added_weight_reps' then
      new.weight_kg := 0;
    else
      raise exception 'completed_set_requires_weight' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger session_sets_validate before insert or update on public.session_sets
  for each row execute function public.validate_session_set();

-- ---------------------------------------------------------------------------
-- Split sharing (snapshots addressed by unguessable tokens)
-- ---------------------------------------------------------------------------

create table public.split_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  split_id uuid not null,
  -- 192 bits of randomness, URL safe.
  token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  include_notes boolean not null default false,
  snapshot jsonb not null,
  snapshot_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (split_id, user_id) references public.splits (id, user_id) on delete cascade
);

create unique index split_shares_one_live_per_split on public.split_shares (split_id)
  where revoked_at is null;
create index split_shares_user_idx on public.split_shares (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.splits enable row level security;
alter table public.split_active_periods enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.session_sets enable row level security;
alter table public.split_shares enable row level security;

-- Anonymous visitors never touch tables directly; shared splits go through
-- public.get_shared_split().
revoke all on all tables in schema public from anon;

create policy "profiles: own row" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: update own row" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "exercises: catalogue and own" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "exercises: create own custom" on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()) and slug is null);
create policy "exercises: update own custom" on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and slug is null);
create policy "exercises: delete own custom" on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'splits', 'split_active_periods', 'workout_templates', 'template_exercises',
    'workout_sessions', 'session_exercises', 'session_sets', 'split_shares'
  ] loop
    execute format(
      'create policy "%1$s: owner only" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t);
  end loop;
end;
$$;
