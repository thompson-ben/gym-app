-- Splitmate server-side operations.
--
-- Everything that must be atomic (activation, duplication, session start/sync/finish,
-- sharing and copying) lives here. Functions are SECURITY INVOKER unless stated otherwise,
-- so Row Level Security still applies to every row they touch.

-- ---------------------------------------------------------------------------
-- Split activation
-- ---------------------------------------------------------------------------

-- Serialises activation changes for one user.
create or replace function public.lock_user_activation(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('splitmate.activation:' || p_user::text, 0));
$$;

create or replace function public.activate_split(p_split_id uuid)
returns public.split_active_periods
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_open public.split_active_periods;
  v_new public.split_active_periods;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.lock_user_activation(v_user);

  if not exists (select 1 from public.splits where id = p_split_id and user_id = v_user) then
    raise exception 'split_not_found' using errcode = 'P0002';
  end if;

  select * into v_open from public.split_active_periods
  where user_id = v_user and ended_at is null
  for update;

  -- Re-activating the current split is a no-op.
  if found and v_open.split_id = p_split_id then
    return v_open;
  end if;

  if found then
    update public.split_active_periods
    set ended_at = greatest(v_now, started_at + interval '1 second')
    where id = v_open.id;
    v_now := greatest(v_now, v_open.started_at + interval '1 second');
  end if;

  insert into public.split_active_periods (user_id, split_id, started_at)
  values (v_user, p_split_id, v_now)
  returning * into v_new;
  return v_new;
end;
$$;

create or replace function public.deactivate_split()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.lock_user_activation(v_user);
  update public.split_active_periods
  set ended_at = greatest(now(), started_at + interval '1 second')
  where user_id = v_user and ended_at is null;
end;
$$;

-- Corrects the dates of an activation period. Overlaps and impossible ranges are rejected
-- by constraints and surfaced as readable errors.
create or replace function public.update_active_period(
  p_period_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz
)
returns public.split_active_periods
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.split_active_periods;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.lock_user_activation(v_user);

  select * into v_row from public.split_active_periods
  where id = p_period_id and user_id = v_user for update;
  if not found then
    raise exception 'period_not_found' using errcode = 'P0002';
  end if;
  -- An open period stays open: ending it is done via deactivation or activating another split.
  if v_row.ended_at is null and p_ended_at is not null then
    raise exception 'period_is_open' using errcode = '22023';
  end if;
  if v_row.ended_at is not null and p_ended_at is null then
    raise exception 'period_end_required' using errcode = '22023';
  end if;
  if p_ended_at is not null and p_ended_at <= p_started_at then
    raise exception 'period_range_invalid' using errcode = '22023';
  end if;

  begin
    update public.split_active_periods
    set started_at = p_started_at, ended_at = p_ended_at
    where id = p_period_id
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'period_overlaps' using errcode = '22023';
  end;
  return v_row;
end;
$$;

-- Archives a split. If it is active, the caller must explicitly agree to end the period.
create or replace function public.archive_split(p_split_id uuid, p_end_active_period boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.lock_user_activation(v_user);
  if not exists (select 1 from public.splits where id = p_split_id and user_id = v_user) then
    raise exception 'split_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.split_active_periods
    where user_id = v_user and split_id = p_split_id and ended_at is null
  ) then
    if not p_end_active_period then
      raise exception 'split_is_active' using errcode = '22023';
    end if;
    update public.split_active_periods
    set ended_at = greatest(now(), started_at + interval '1 second')
    where user_id = v_user and split_id = p_split_id and ended_at is null;
  end if;
  update public.splits set archived_at = coalesce(archived_at, now()) where id = p_split_id;
end;
$$;

-- Activation periods for a split with the number of workouts completed from that split in each.
create or replace function public.split_periods(p_split_id uuid)
returns table (
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  completed_workouts bigint
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.started_at, p.ended_at,
    (select count(*) from public.workout_sessions ws
      where ws.user_id = p.user_id
        and ws.split_id = p.split_id
        and ws.status = 'completed'
        and ws.completed_at >= p.started_at
        and (p.ended_at is null or ws.completed_at < p.ended_at))
  from public.split_active_periods p
  where p.split_id = p_split_id and p.user_id = auth.uid()
  order by p.started_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Split / template copying
-- ---------------------------------------------------------------------------

create or replace function public.duplicate_split(p_split_id uuid, p_name text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_src public.splits;
  v_new_split uuid;
  v_tpl record;
  v_new_tpl uuid;
begin
  select * into v_src from public.splits where id = p_split_id and user_id = v_user;
  if not found then
    raise exception 'split_not_found' using errcode = 'P0002';
  end if;

  insert into public.splits (user_id, name, description)
  values (v_user, coalesce(nullif(btrim(p_name), ''), left(v_src.name || ' (copy)', 60)), v_src.description)
  returning id into v_new_split;

  for v_tpl in
    select * from public.workout_templates where split_id = p_split_id order by position, created_at
  loop
    insert into public.workout_templates (user_id, split_id, name, position)
    values (v_user, v_new_split, v_tpl.name, v_tpl.position)
    returning id into v_new_tpl;

    insert into public.template_exercises
      (user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes)
    select v_user, v_new_tpl, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes
    from public.template_exercises where template_id = v_tpl.id;
  end loop;
  return v_new_split;
end;
$$;

create or replace function public.duplicate_template(p_template_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_src public.workout_templates;
  v_new uuid;
begin
  select * into v_src from public.workout_templates where id = p_template_id and user_id = v_user;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;

  -- Place the copy directly after the original.
  update public.workout_templates set position = position + 1
  where split_id = v_src.split_id and position > v_src.position;

  insert into public.workout_templates (user_id, split_id, name, position)
  values (v_user, v_src.split_id, left(v_src.name || ' (copy)', 60), v_src.position + 1)
  returning id into v_new;

  insert into public.template_exercises
    (user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes)
  select v_user, v_new, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes
  from public.template_exercises where template_id = p_template_id;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

-- Full JSON document for a session (used by the logger and returned on sync conflicts).
create or replace function public.session_document(p_session_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', ws.id,
    'status', ws.status,
    'revision', ws.revision,
    'split_id', ws.split_id,
    'template_id', ws.template_id,
    'split_name', ws.split_name,
    'template_name', ws.template_name,
    'started_at', ws.started_at,
    'completed_at', ws.completed_at,
    'notes', ws.notes,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', se.id,
        'exercise_id', se.exercise_id,
        'template_exercise_id', se.template_exercise_id,
        'position', se.position,
        'exercise_name', se.exercise_name,
        'tracking_mode', e.tracking_mode,
        'target_sets', se.target_sets,
        'rep_min', se.rep_min,
        'rep_max', se.rep_max,
        'rest_seconds', se.rest_seconds,
        'template_notes', se.template_notes,
        'notes', se.notes,
        'skipped', se.skipped,
        'sets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ss.id,
            'position', ss.position,
            'set_type', ss.set_type,
            'weight_kg', ss.weight_kg,
            'reps', ss.reps,
            'completed_at', ss.completed_at
          ) order by ss.position, ss.created_at)
          from public.session_sets ss where ss.session_exercise_id = se.id
        ), '[]'::jsonb)
      ) order by se.position, se.created_at)
      from public.session_exercises se
      join public.exercises e on e.id = se.exercise_id
      where se.session_id = ws.id
    ), '[]'::jsonb)
  )
  from public.workout_sessions ws
  where ws.id = p_session_id and ws.user_id = auth.uid();
$$;

-- Starts a workout from a template. Idempotent on p_session_id: retrying with the same id
-- returns the existing session instead of creating a duplicate.
create or replace function public.start_session(p_session_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.workout_sessions;
  v_tpl public.workout_templates;
  v_split public.splits;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_existing from public.workout_sessions where id = p_session_id and user_id = v_user;
  if found then
    return public.session_document(p_session_id);
  end if;

  select * into v_existing from public.workout_sessions
  where user_id = v_user and status = 'in_progress';
  if found then
    raise exception 'session_in_progress' using errcode = '22023', detail = v_existing.id::text;
  end if;

  select * into v_tpl from public.workout_templates where id = p_template_id and user_id = v_user;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  select * into v_split from public.splits where id = v_tpl.split_id;

  insert into public.workout_sessions (id, user_id, split_id, template_id, split_name, template_name)
  values (p_session_id, v_user, v_split.id, v_tpl.id, v_split.name, v_tpl.name);

  insert into public.session_exercises (
    user_id, session_id, exercise_id, template_exercise_id, position, exercise_name,
    target_sets, rep_min, rep_max, rest_seconds, template_notes
  )
  select v_user, p_session_id, te.exercise_id, te.id, te.position,
    left(e.name || coalesce(' · ' || e.variant, ''), 120),
    te.target_sets, te.rep_min, te.rep_max, te.rest_seconds, te.notes
  from public.template_exercises te
  join public.exercises e on e.id = te.exercise_id
  where te.template_id = v_tpl.id;

  return public.session_document(p_session_id);
exception when unique_violation then
  -- A concurrent request created the session (same id) or another in-progress session.
  if exists (select 1 from public.workout_sessions where id = p_session_id and user_id = v_user) then
    return public.session_document(p_session_id);
  end if;
  raise exception 'session_in_progress' using errcode = '22023';
end;
$$;

-- Replaces the contents of a session with the client's document.
--
-- Safety properties:
--   * p_write_id makes retries idempotent: re-sending an already applied write is a no-op.
--   * p_base_revision is optimistic concurrency: a write based on an outdated revision is
--     rejected with the current server document so the client can resolve the conflict.
--   * Discarded sessions can never be written to again (no resurrection by stale writes).
--   * Completed sessions keep only performed (confirmed) sets.
create or replace function public.sync_session(
  p_session_id uuid,
  p_base_revision integer,
  p_write_id uuid,
  p_doc jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.workout_sessions;
  v_ex jsonb;
  v_set jsonb;
  v_ex_ids uuid[] := '{}';
  v_set_ids uuid[] := '{}';
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_session from public.workout_sessions
  where id = p_session_id and user_id = v_user
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_session.last_write_id = p_write_id then
    return jsonb_build_object('status', 'ok', 'revision', v_session.revision);
  end if;
  if v_session.status = 'discarded' then
    return jsonb_build_object('status', 'discarded');
  end if;
  if v_session.revision <> p_base_revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_session.revision,
      'document', public.session_document(p_session_id));
  end if;

  for v_ex in select * from jsonb_array_elements(coalesce(p_doc -> 'exercises', '[]'::jsonb)) loop
    v_ex_ids := v_ex_ids || (v_ex ->> 'id')::uuid;
  end loop;

  -- Remove entries (and their sets, via cascade) that the client deleted.
  delete from public.session_exercises
  where session_id = p_session_id and not (id = any (v_ex_ids));

  for v_ex in select * from jsonb_array_elements(coalesce(p_doc -> 'exercises', '[]'::jsonb)) loop
    insert into public.session_exercises as se (
      id, user_id, session_id, exercise_id, template_exercise_id, position, exercise_name,
      target_sets, rep_min, rep_max, rest_seconds, template_notes, notes, skipped
    ) values (
      (v_ex ->> 'id')::uuid, v_user, p_session_id, (v_ex ->> 'exercise_id')::uuid,
      -- The source template entry may have been deleted since the session started.
      (select te.id from public.template_exercises te
        where te.id = (v_ex ->> 'template_exercise_id')::uuid and te.user_id = v_user),
      (v_ex ->> 'position')::integer, v_ex ->> 'exercise_name',
      (v_ex ->> 'target_sets')::smallint, (v_ex ->> 'rep_min')::smallint,
      (v_ex ->> 'rep_max')::smallint, (v_ex ->> 'rest_seconds')::integer,
      v_ex ->> 'template_notes', nullif(btrim(v_ex ->> 'notes'), ''),
      coalesce((v_ex ->> 'skipped')::boolean, false)
    )
    on conflict (id) do update set
      exercise_id = excluded.exercise_id,
      position = excluded.position,
      exercise_name = excluded.exercise_name,
      target_sets = excluded.target_sets,
      rep_min = excluded.rep_min,
      rep_max = excluded.rep_max,
      rest_seconds = excluded.rest_seconds,
      notes = excluded.notes,
      skipped = excluded.skipped
    where se.session_id = p_session_id and se.user_id = v_user;

    if not found then
      -- The id exists but belongs to a different session.
      raise exception 'invalid_exercise_entry' using errcode = '22023';
    end if;

    v_set_ids := '{}';
    for v_set in select * from jsonb_array_elements(coalesce(v_ex -> 'sets', '[]'::jsonb)) loop
      if v_session.status = 'completed' and v_set ->> 'completed_at' is null then
        continue;
      end if;
      v_set_ids := v_set_ids || (v_set ->> 'id')::uuid;
    end loop;

    delete from public.session_sets
    where session_exercise_id = (v_ex ->> 'id')::uuid and not (id = any (v_set_ids));

    for v_set in select * from jsonb_array_elements(coalesce(v_ex -> 'sets', '[]'::jsonb)) loop
      if v_session.status = 'completed' and v_set ->> 'completed_at' is null then
        continue;
      end if;
      insert into public.session_sets as ss (
        id, user_id, session_exercise_id, position, set_type, weight_kg, reps, completed_at
      ) values (
        (v_set ->> 'id')::uuid, v_user, (v_ex ->> 'id')::uuid,
        (v_set ->> 'position')::integer,
        coalesce(v_set ->> 'set_type', 'working'),
        (v_set ->> 'weight_kg')::numeric, (v_set ->> 'reps')::smallint,
        (v_set ->> 'completed_at')::timestamptz
      )
      on conflict (id) do update set
        position = excluded.position,
        set_type = excluded.set_type,
        weight_kg = excluded.weight_kg,
        reps = excluded.reps,
        completed_at = excluded.completed_at
      where ss.session_exercise_id = (v_ex ->> 'id')::uuid and ss.user_id = v_user;

      if not found then
        raise exception 'invalid_set' using errcode = '22023';
      end if;
    end loop;
  end loop;

  update public.workout_sessions
  set revision = revision + 1,
      last_write_id = p_write_id,
      notes = nullif(btrim(p_doc ->> 'notes'), '')
  where id = p_session_id
  returning revision into v_session.revision;

  return jsonb_build_object('status', 'ok', 'revision', v_session.revision);
end;
$$;

-- Finishes a session. Unconfirmed (draft) sets are removed so prefilled values are never
-- recorded as performance. Idempotent: finishing an already completed session is a no-op.
create or replace function public.finish_session(p_session_id uuid, p_expected_revision integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.workout_sessions;
begin
  select * into v_session from public.workout_sessions
  where id = p_session_id and user_id = v_user
  for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'revision', v_session.revision);
  end if;
  if v_session.status = 'discarded' then
    raise exception 'session_discarded' using errcode = '22023';
  end if;
  if v_session.revision <> p_expected_revision then
    raise exception 'revision_mismatch' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.session_sets ss
    join public.session_exercises se on se.id = ss.session_exercise_id
    where se.session_id = p_session_id and ss.completed_at is not null
  ) then
    raise exception 'no_completed_sets' using errcode = '22023';
  end if;

  delete from public.session_sets ss
  using public.session_exercises se
  where se.id = ss.session_exercise_id and se.session_id = p_session_id and ss.completed_at is null;

  update public.session_exercises se set skipped = true
  where se.session_id = p_session_id
    and not exists (select 1 from public.session_sets ss where ss.session_exercise_id = se.id);

  update public.workout_sessions
  set status = 'completed', completed_at = now(), revision = revision + 1
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object('status', 'completed', 'revision', v_session.revision);
end;
$$;

create or replace function public.discard_session(p_session_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
begin
  select status into v_status from public.workout_sessions
  where id = p_session_id and user_id = v_user
  for update;
  if not found or v_status = 'discarded' then
    return;
  end if;
  if v_status <> 'in_progress' then
    raise exception 'session_already_completed' using errcode = '22023';
  end if;
  delete from public.session_exercises where session_id = p_session_id;
  update public.workout_sessions
  set status = 'discarded', revision = revision + 1
  where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Performance history (always the caller's own, completed sessions only)
-- ---------------------------------------------------------------------------

-- The most recent completed session containing each exercise, across all splits and
-- workouts, with that session's performed sets in order. Never mixes days.
create or replace function public.previous_performance(
  p_exercise_ids uuid[],
  p_before timestamptz default null
)
returns table (
  exercise_id uuid,
  session_id uuid,
  completed_at timestamptz,
  template_name text,
  split_name text,
  sets jsonb
)
language sql
stable
set search_path = ''
as $$
  select distinct on (se.exercise_id)
    se.exercise_id, ws.id, ws.completed_at, ws.template_name, ws.split_name,
    (
      select jsonb_agg(jsonb_build_object(
        'set_type', ss.set_type, 'weight_kg', ss.weight_kg, 'reps', ss.reps
      ) order by se2.position, ss.position, ss.created_at)
      from public.session_exercises se2
      join public.session_sets ss on ss.session_exercise_id = se2.id
      where se2.session_id = ws.id and se2.exercise_id = se.exercise_id
        and ss.completed_at is not null
    )
  from public.session_exercises se
  join public.workout_sessions ws on ws.id = se.session_id
  where se.user_id = auth.uid()
    and ws.user_id = auth.uid()
    and ws.status = 'completed'
    and se.exercise_id = any (p_exercise_ids)
    and (p_before is null or ws.completed_at < p_before)
    and exists (
      select 1 from public.session_sets ss
      where ss.session_exercise_id = se.id and ss.completed_at is not null
    )
  order by se.exercise_id, ws.completed_at desc, ws.id;
$$;

-- Chronological history of one exercise, optionally limited to a split or an activation
-- period (sessions completed while that period was open).
create or replace function public.exercise_history(
  p_exercise_id uuid,
  p_split_id uuid default null,
  p_period_id uuid default null
)
returns table (
  session_id uuid,
  completed_at timestamptz,
  template_name text,
  split_name text,
  split_id uuid,
  sets jsonb
)
language sql
stable
set search_path = ''
as $$
  with period as (
    select started_at, ended_at from public.split_active_periods
    where id = p_period_id and user_id = auth.uid()
  )
  select ws.id, ws.completed_at, ws.template_name, ws.split_name, ws.split_id,
    jsonb_agg(jsonb_build_object(
      'set_type', ss.set_type, 'weight_kg', ss.weight_kg, 'reps', ss.reps
    ) order by se.position, ss.position, ss.created_at)
  from public.workout_sessions ws
  join public.session_exercises se on se.session_id = ws.id
  join public.session_sets ss on ss.session_exercise_id = se.id
  where ws.user_id = auth.uid()
    and se.user_id = auth.uid()
    and ws.status = 'completed'
    and se.exercise_id = p_exercise_id
    and ss.completed_at is not null
    and (p_split_id is null or ws.split_id = p_split_id)
    and (p_period_id is null or exists (
      select 1 from period p
      where ws.completed_at >= p.started_at and (p.ended_at is null or ws.completed_at < p.ended_at)
    ))
  group by ws.id
  order by ws.completed_at desc;
$$;

-- Exercises the caller has performed, with last-performed date and session count.
create or replace function public.performed_exercises()
returns table (
  exercise_id uuid,
  last_completed_at timestamptz,
  session_count bigint
)
language sql
stable
set search_path = ''
as $$
  select se.exercise_id, max(ws.completed_at), count(distinct ws.id)
  from public.session_exercises se
  join public.workout_sessions ws on ws.id = se.session_id
  where se.user_id = auth.uid() and ws.status = 'completed'
    and exists (
      select 1 from public.session_sets ss
      where ss.session_exercise_id = se.id and ss.completed_at is not null
    )
  group by se.exercise_id
  order by max(ws.completed_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- Sharing
-- ---------------------------------------------------------------------------

-- Builds the exact content a share link exposes: structure, exercises and targets only.
-- Catalogue exercises keep their canonical ids. Custom exercises are described by their
-- definition only; recipients create their own copy or explicitly map them.
create or replace function public.build_split_snapshot(p_split_id uuid, p_include_notes boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'workouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', wt.name,
        'exercises', coalesce((
          select jsonb_agg(jsonb_build_object(
            'exercise', case when e.owner_id is null then
              jsonb_build_object('kind', 'catalogue', 'id', e.id, 'name', e.name,
                'primary_muscle', e.primary_muscle, 'equipment', e.equipment,
                'tracking_mode', e.tracking_mode)
            else
              jsonb_build_object('kind', 'custom', 'ref', e.id, 'name', e.name,
                'variant', e.variant, 'primary_muscle', e.primary_muscle,
                'equipment', e.equipment, 'tracking_mode', e.tracking_mode)
            end,
            'target_sets', te.target_sets,
            'rep_min', te.rep_min,
            'rep_max', te.rep_max,
            'rest_seconds', te.rest_seconds,
            'notes', case when p_include_notes then te.notes else null end
          ) order by te.position, te.created_at)
          from public.template_exercises te
          join public.exercises e on e.id = te.exercise_id
          where te.template_id = wt.id
        ), '[]'::jsonb)
      ) order by wt.position, wt.created_at)
      from public.workout_templates wt
      where wt.split_id = s.id
    ), '[]'::jsonb)
  )
  from public.splits s
  where s.id = p_split_id and s.user_id = auth.uid();
$$;

-- Creates the split's share link, or refreshes the snapshot of its existing live link.
create or replace function public.upsert_split_share(
  p_split_id uuid,
  p_name text,
  p_description text,
  p_include_notes boolean
)
returns public.split_shares
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_snapshot jsonb;
  v_row public.split_shares;
begin
  v_snapshot := public.build_split_snapshot(p_split_id, p_include_notes);
  if v_snapshot is null then
    raise exception 'split_not_found' using errcode = 'P0002';
  end if;

  update public.split_shares
  set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      include_notes = p_include_notes, snapshot = v_snapshot, snapshot_at = now()
  where split_id = p_split_id and user_id = v_user and revoked_at is null
  returning * into v_row;

  if not found then
    insert into public.split_shares (user_id, split_id, name, description, include_notes, snapshot)
    values (v_user, p_split_id, btrim(p_name), nullif(btrim(p_description), ''), p_include_notes, v_snapshot)
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.revoke_split_share(p_share_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.split_shares set revoked_at = now()
  where id = p_share_id and user_id = auth.uid() and revoked_at is null;
$$;

-- Public read of a share by token. SECURITY DEFINER because recipients (including signed-out
-- visitors) have no row access to split_shares. Returns only the snapshot content.
create or replace function public.get_shared_split(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', sh.name,
    'description', sh.description,
    'include_notes', sh.include_notes,
    'snapshot_at', sh.snapshot_at,
    'snapshot', sh.snapshot
  )
  from public.split_shares sh
  where sh.token = p_token and sh.revoked_at is null;
$$;

-- Copies a shared split into the caller's account as independent templates.
--
-- p_custom_choices maps each custom exercise ref in the snapshot to either
--   {"action": "create"}                    create a new custom exercise owned by the caller, or
--   {"action": "map", "exercise_id": ...}   use an exercise the caller already has access to.
-- Refs without a choice default to "create"; nothing is ever merged implicitly.
--
-- SECURITY DEFINER only to read the share by token; every row written is owned by the
-- caller and every mapped exercise is checked to be usable by the caller.
create or replace function public.copy_shared_split(p_token text, p_custom_choices jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_share public.split_shares;
  v_split uuid;
  v_tpl uuid;
  v_w jsonb;
  v_x jsonb;
  v_w_pos integer := 0;
  v_x_pos integer;
  v_ref text;
  v_choice jsonb;
  v_exercise uuid;
  v_map jsonb := '{}'::jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_share from public.split_shares where token = p_token and revoked_at is null;
  if not found then
    raise exception 'share_not_found' using errcode = 'P0002';
  end if;

  insert into public.splits (user_id, name, description, copied_from_share_id)
  values (v_user, v_share.name, v_share.description, v_share.id)
  returning id into v_split;

  for v_w in select * from jsonb_array_elements(v_share.snapshot -> 'workouts') loop
    insert into public.workout_templates (user_id, split_id, name, position)
    values (v_user, v_split, v_w ->> 'name', v_w_pos)
    returning id into v_tpl;
    v_w_pos := v_w_pos + 1;
    v_x_pos := 0;

    for v_x in select * from jsonb_array_elements(v_w -> 'exercises') loop
      if v_x -> 'exercise' ->> 'kind' = 'catalogue' then
        select id into v_exercise from public.exercises
        where id = (v_x -> 'exercise' ->> 'id')::uuid and owner_id is null;
        if not found then
          raise exception 'catalogue_exercise_missing' using errcode = 'P0002';
        end if;
      else
        v_ref := v_x -> 'exercise' ->> 'ref';
        if v_map ? v_ref then
          v_exercise := (v_map ->> v_ref)::uuid;
        else
          v_choice := coalesce(p_custom_choices -> v_ref, '{"action":"create"}'::jsonb);
          if exists (select 1 from public.exercises where id = v_ref::uuid and owner_id = v_user) then
            -- The caller's own custom exercise (e.g. copying their own share): same identity.
            v_exercise := v_ref::uuid;
          elsif v_choice ->> 'action' = 'map' then
            select id into v_exercise from public.exercises
            where id = (v_choice ->> 'exercise_id')::uuid
              and (owner_id is null or owner_id = v_user);
            if not found then
              raise exception 'mapped_exercise_not_available' using errcode = '42501';
            end if;
          else
            insert into public.exercises (owner_id, name, variant, primary_muscle, equipment,
              tracking_mode, origin_exercise_id)
            values (v_user, v_x -> 'exercise' ->> 'name', v_x -> 'exercise' ->> 'variant',
              v_x -> 'exercise' ->> 'primary_muscle', v_x -> 'exercise' ->> 'equipment',
              v_x -> 'exercise' ->> 'tracking_mode', v_ref::uuid)
            returning id into v_exercise;
          end if;
          v_map := v_map || jsonb_build_object(v_ref, v_exercise);
        end if;
      end if;

      insert into public.template_exercises (user_id, template_id, exercise_id, position,
        target_sets, rep_min, rep_max, rest_seconds, notes)
      values (v_user, v_tpl, v_exercise, v_x_pos,
        (v_x ->> 'target_sets')::smallint, (v_x ->> 'rep_min')::smallint,
        (v_x ->> 'rep_max')::smallint, (v_x ->> 'rest_seconds')::integer, v_x ->> 'notes');
      v_x_pos := v_x_pos + 1;
    end loop;
  end loop;
  return v_split;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing callable by anonymous visitors except reading a share.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_shared_split(text) to anon, authenticated;
grant execute on function
  public.activate_split(uuid),
  public.deactivate_split(),
  public.update_active_period(uuid, timestamptz, timestamptz),
  public.archive_split(uuid, boolean),
  public.split_periods(uuid),
  public.duplicate_split(uuid, text),
  public.duplicate_template(uuid),
  public.session_document(uuid),
  public.start_session(uuid, uuid),
  public.sync_session(uuid, integer, uuid, jsonb),
  public.finish_session(uuid, integer),
  public.discard_session(uuid),
  public.previous_performance(uuid[], timestamptz),
  public.exercise_history(uuid, uuid, uuid),
  public.performed_exercises(),
  public.build_split_snapshot(uuid, boolean),
  public.upsert_split_share(uuid, text, text, boolean),
  public.revoke_split_share(uuid),
  public.copy_shared_split(text, jsonb)
to authenticated;

-- Internal helpers are not part of the API.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.assert_exercise_usable() from authenticated;
