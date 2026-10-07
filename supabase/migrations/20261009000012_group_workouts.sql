-- Group workouts: train together from one shared plan.
--
-- A host creates a group workout (from one of their workouts, or empty), edits its plan and
-- shares an invite link. Friends join with the link. At the gym everyone starts their own
-- session from the plan and logs their own sets into their own history.
--
-- Privacy: members see the plan, each other's chosen display names and whether each person
-- has started or finished. Nobody sees anyone else's weights, reps or history: sessions stay
-- owner-only under the existing RLS. Only the host edits the plan.
--
-- Additive: three new tables, one nullable column on workout_sessions, new functions.
-- Existing rows, functions and policies are unchanged.

create table public.group_workouts (
  id uuid primary key default gen_random_uuid(),
  -- The host.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  planned_for timestamptz,
  -- 192 bits of randomness, URL safe. Anyone with the link can see the plan and join.
  invite_token text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  -- Provenance only: the host's workout it was created from (lets the host's session count
  -- towards their split's "next workout").
  source_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index group_workouts_user_idx on public.group_workouts (user_id, created_at desc);
create trigger group_workouts_updated_at before update on public.group_workouts
  for each row execute function public.set_updated_at();

create table public.group_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  -- The host (plan rows belong to the group's owner).
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_workout_id uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position integer not null default 0,
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  rest_seconds integer check (rest_seconds between 15 and 900),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_workout_id, user_id) references public.group_workouts (id, user_id) on delete cascade,
  constraint group_rep_range_valid check (rep_min is null or rep_max is null or rep_min <= rep_max)
);

create index group_workout_exercises_group_idx on public.group_workout_exercises (group_workout_id, position);
create trigger group_workout_exercises_updated_at before update on public.group_workout_exercises
  for each row execute function public.set_updated_at();
-- The host may only plan catalogue exercises or their own custom exercises.
create trigger group_workout_exercises_exercise_usable before insert or update of exercise_id, user_id
  on public.group_workout_exercises for each row execute function public.assert_exercise_usable();

create table public.group_workout_members (
  group_workout_id uuid not null references public.group_workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The name this person chose to show to the group (not their email).
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  role text not null default 'member' check (role in ('host', 'member')),
  -- Only whether they have started or finished, kept in step with their own session.
  status text not null default 'joined' check (status in ('joined', 'in_progress', 'completed')),
  status_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (group_workout_id, user_id)
);

create index group_workout_members_user_idx on public.group_workout_members (user_id, joined_at desc);

-- A session started from a group workout. Set null if the group is deleted: history stays.
alter table public.workout_sessions
  add column if not exists group_workout_id uuid references public.group_workouts (id) on delete set null;
create index if not exists workout_sessions_group_idx on public.workout_sessions (group_workout_id)
  where group_workout_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Membership check that does not recurse through the members table's own policy.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_workout_members
    where group_workout_id = p_group_id and user_id = auth.uid()
  );
$$;

alter table public.group_workouts enable row level security;
alter table public.group_workout_exercises enable row level security;
alter table public.group_workout_members enable row level security;
revoke all on public.group_workouts, public.group_workout_exercises, public.group_workout_members from anon;

create policy "group_workouts: members read" on public.group_workouts for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_member(id));
create policy "group_workouts: host updates" on public.group_workouts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "group_workouts: host deletes" on public.group_workouts for delete to authenticated
  using (user_id = (select auth.uid()));
-- Created through create_group_workout() so the host's membership is added in the same step.

create policy "group_workout_exercises: members read" on public.group_workout_exercises for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_member(group_workout_id));
create policy "group_workout_exercises: host writes" on public.group_workout_exercises for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "group_workout_members: members read" on public.group_workout_members for select to authenticated
  using (public.is_group_member(group_workout_id));
-- Members leave; the host removes members. The host's own row goes with the group.
create policy "group_workout_members: leave or remove" on public.group_workout_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role = 'member')
    or (role = 'member' and exists (
      select 1 from public.group_workouts g where g.id = group_workout_id and g.user_id = (select auth.uid())
    ))
  );
-- Joining goes through join_group_workout(); status is maintained by a trigger.
revoke insert, update on public.group_workout_members from authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.clean_display_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40), '');
$$;

-- Creates a group workout, optionally copying the plan of one of the caller's workouts.
create or replace function public.create_group_workout(
  p_name text,
  p_display_name text,
  p_template_id uuid default null,
  p_planned_for timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_display text := public.clean_display_name(p_display_name);
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'workout_name_required' using errcode = '22023';
  end if;
  if v_display is null then
    raise exception 'display_name_required' using errcode = '22023';
  end if;
  if p_template_id is not null
     and not exists (select 1 from public.workout_templates where id = p_template_id and user_id = v_user) then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;

  insert into public.group_workouts (user_id, name, planned_for, source_template_id)
  values (v_user, v_name, p_planned_for, p_template_id)
  returning id into v_group;

  insert into public.group_workout_members (group_workout_id, user_id, display_name, role)
  values (v_group, v_user, v_display, 'host');

  if p_template_id is not null then
    insert into public.group_workout_exercises
      (user_id, group_workout_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes)
    select v_user, v_group, te.exercise_id, te.position, te.target_sets, te.rep_min, te.rep_max,
      te.rest_seconds, te.notes
    from public.template_exercises te
    where te.template_id = p_template_id and te.user_id = v_user;
  end if;

  return v_group;
end;
$$;

-- What an invite link shows before joining (also to signed-out visitors): the plan, the
-- host's display name and how many have joined. Never ids of other people or their data.
create or replace function public.group_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', g.name,
    'planned_for', g.planned_for,
    'host_name', (select m.display_name from public.group_workout_members m
                  where m.group_workout_id = g.id and m.role = 'host'),
    'member_count', (select count(*) from public.group_workout_members m where m.group_workout_id = g.id),
    -- Only for someone already in the group, so they can be sent straight to it.
    'group_id', case when public.is_group_member(g.id) then g.id end,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', e.name || coalesce(' · ' || e.variant, ''),
        'target_sets', x.target_sets, 'rep_min', x.rep_min, 'rep_max', x.rep_max
      ) order by x.position, x.created_at)
      from public.group_workout_exercises x join public.exercises e on e.id = x.exercise_id
      where x.group_workout_id = g.id
    ), '[]'::jsonb)
  )
  from public.group_workouts g
  where g.invite_token = p_token;
$$;

create or replace function public.join_group_workout(p_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group public.group_workouts;
  v_display text := public.clean_display_name(p_display_name);
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_group from public.group_workouts where invite_token = p_token for update;
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_workout_members where group_workout_id = v_group.id and user_id = v_user) then
    return v_group.id;
  end if;
  if v_display is null then
    raise exception 'display_name_required' using errcode = '22023';
  end if;
  if (select count(*) from public.group_workout_members where group_workout_id = v_group.id) >= 10 then
    raise exception 'group_full' using errcode = '22023';
  end if;
  insert into public.group_workout_members (group_workout_id, user_id, display_name, role)
  values (v_group.id, v_user, v_display, 'member');
  return v_group.id;
end;
$$;

-- Everything the group page needs, for members only. Exercise names come from the host's
-- exercises (members cannot read the host's custom exercises directly).
create or replace function public.group_workout_document(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'planned_for', g.planned_for,
    'is_host', g.user_id = auth.uid(),
    'invite_token', case when g.user_id = auth.uid() then g.invite_token end,
    'created_at', g.created_at,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'exercise_id', x.exercise_id,
        'name', e.name,
        'variant', e.variant,
        'tracking_mode', e.tracking_mode,
        'custom', e.owner_id is not null,
        'position', x.position,
        'target_sets', x.target_sets,
        'rep_min', x.rep_min,
        'rep_max', x.rep_max,
        'rest_seconds', x.rest_seconds,
        'notes', x.notes
      ) order by x.position, x.created_at)
      from public.group_workout_exercises x join public.exercises e on e.id = x.exercise_id
      where x.group_workout_id = g.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', m.display_name,
        'role', m.role,
        'status', m.status,
        'is_me', m.user_id = auth.uid(),
        -- Opaque handle so the host can remove someone; not their account id.
        'member_key', md5(m.group_workout_id::text || ':' || m.user_id::text)
      ) order by (m.role = 'host') desc, m.joined_at)
      from public.group_workout_members m where m.group_workout_id = g.id
    ), '[]'::jsonb),
    'my_session', (
      select jsonb_build_object('id', ws.id, 'status', ws.status)
      from public.workout_sessions ws
      where ws.group_workout_id = g.id and ws.user_id = auth.uid() and ws.status <> 'discarded'
      order by ws.created_at desc limit 1
    )
  )
  from public.group_workouts g
  where g.id = p_group_id and public.is_group_member(g.id);
$$;

-- Host removes a member by the opaque key from group_workout_document().
create or replace function public.remove_group_member(p_group_id uuid, p_member_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.group_workouts where id = p_group_id and user_id = auth.uid()) then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  delete from public.group_workout_members
  where group_workout_id = p_group_id and role = 'member'
    and md5(group_workout_id::text || ':' || user_id::text) = p_member_key;
end;
$$;

-- A member leaves (the host deletes the group instead).
create or replace function public.leave_group_workout(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.group_workout_members
  where group_workout_id = p_group_id and user_id = auth.uid() and role = 'member';
$$;

-- Starts the caller's own session from the group plan. Catalogue exercises are used as they
-- are. A host's custom exercise maps to the member's own copy (made once, then reused, so a
-- member's history for it continues across group workouts).
create or replace function public.start_group_session(p_session_id uuid, p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group public.group_workouts;
  v_existing public.workout_sessions;
  v_tpl public.workout_templates;
  v_split public.splits;
  v_x record;
  v_exercise uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_existing from public.workout_sessions where id = p_session_id and user_id = v_user;
  if found then
    return public.session_document(p_session_id);
  end if;
  select * into v_group from public.group_workouts where id = p_group_id;
  if not found or not public.is_group_member(p_group_id) then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.group_workout_exercises where group_workout_id = p_group_id) then
    raise exception 'group_plan_empty' using errcode = '22023';
  end if;
  select * into v_existing from public.workout_sessions where user_id = v_user and status = 'in_progress';
  if found then
    raise exception 'session_in_progress' using errcode = '22023', detail = v_existing.id::text;
  end if;
  if exists (select 1 from public.workout_sessions
             where user_id = v_user and group_workout_id = p_group_id and status = 'completed') then
    raise exception 'group_session_completed' using errcode = '22023';
  end if;

  -- The host's session counts as the workout it was planned from.
  if v_group.user_id = v_user and v_group.source_template_id is not null then
    select * into v_tpl from public.workout_templates where id = v_group.source_template_id and user_id = v_user;
    if found then
      select * into v_split from public.splits where id = v_tpl.split_id;
    end if;
  end if;

  insert into public.workout_sessions
    (id, user_id, split_id, template_id, split_name, template_name, group_workout_id)
  values (p_session_id, v_user, v_split.id, v_tpl.id, v_split.name, v_group.name, p_group_id);

  for v_x in
    select x.*, e.owner_id, e.name, e.variant, e.primary_muscle, e.equipment, e.tracking_mode
    from public.group_workout_exercises x join public.exercises e on e.id = x.exercise_id
    where x.group_workout_id = p_group_id
    order by x.position, x.created_at
  loop
    if v_x.owner_id is null or v_x.owner_id = v_user then
      v_exercise := v_x.exercise_id;
    else
      select id into v_exercise from public.exercises
      where owner_id = v_user and origin_exercise_id = v_x.exercise_id
      order by archived_at nulls first, created_at limit 1;
      if not found then
        insert into public.exercises (owner_id, name, variant, primary_muscle, equipment, tracking_mode, origin_exercise_id)
        values (v_user, v_x.name, v_x.variant, v_x.primary_muscle, v_x.equipment, v_x.tracking_mode, v_x.exercise_id)
        returning id into v_exercise;
      end if;
    end if;
    insert into public.session_exercises (
      user_id, session_id, exercise_id, position, exercise_name,
      target_sets, rep_min, rep_max, rest_seconds, template_notes
    )
    select v_user, p_session_id, v_exercise, v_x.position,
      left(e.name || coalesce(' · ' || e.variant, ''), 120),
      v_x.target_sets, v_x.rep_min, v_x.rep_max, v_x.rest_seconds, v_x.notes
    from public.exercises e where e.id = v_exercise;
  end loop;

  return public.session_document(p_session_id);
exception when unique_violation then
  if exists (select 1 from public.workout_sessions where id = p_session_id and user_id = v_user) then
    return public.session_document(p_session_id);
  end if;
  raise exception 'session_in_progress' using errcode = '22023';
end;
$$;

-- Keeps each member's started/finished status in step with their own session.
create or replace function public.sync_group_member_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.workout_sessions := case when tg_op = 'DELETE' then old else new end;
  v_status text;
begin
  if v_row.group_workout_id is null then
    return null;
  end if;
  v_status := case
    when tg_op = 'DELETE' or v_row.status = 'discarded' then 'joined'
    else v_row.status
  end;
  update public.group_workout_members
  set status = v_status, status_at = now()
  where group_workout_id = v_row.group_workout_id and user_id = v_row.user_id;
  return null;
end;
$$;

create trigger workout_sessions_group_status
  after insert or update of status or delete on public.workout_sessions
  for each row execute function public.sync_group_member_status();

revoke execute on function
  public.is_group_member(uuid),
  public.clean_display_name(text),
  public.create_group_workout(text, text, uuid, timestamptz),
  public.group_invite_preview(text),
  public.join_group_workout(text, text),
  public.group_workout_document(uuid),
  public.remove_group_member(uuid, text),
  public.leave_group_workout(uuid),
  public.start_group_session(uuid, uuid),
  public.sync_group_member_status()
from public, anon;
grant execute on function
  public.is_group_member(uuid),
  public.create_group_workout(text, text, uuid, timestamptz),
  public.group_invite_preview(text),
  public.join_group_workout(text, text),
  public.group_workout_document(uuid),
  public.remove_group_member(uuid, text),
  public.leave_group_workout(uuid),
  public.start_group_session(uuid, uuid)
to authenticated;
-- The invite page shows the plan to signed-out visitors too.
grant execute on function public.group_invite_preview(text) to anon;
