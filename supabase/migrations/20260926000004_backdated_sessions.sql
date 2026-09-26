-- Logging workouts that were performed earlier ("backdating").
--
-- A session can be started for a past date/time (or moved to one while logging). It is then
-- recorded as performed at that moment, so history, "previous performance" and active-period
-- counts follow the date the workout actually happened rather than when it was typed in.

alter table public.workout_sessions
  add column is_backdated boolean not null default false;

comment on column public.workout_sessions.is_backdated is
  'True when the workout was logged for an earlier date; completed_at is then set to started_at.';

-- Workout dates may not be in the future (a minute of clock skew is allowed) or absurdly old.
create or replace function public.assert_valid_workout_date(p_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_at is null then
    return;
  end if;
  if p_at > now() + interval '1 minute' then
    raise exception 'workout_date_in_future' using errcode = '22023';
  end if;
  if p_at < timestamptz '2000-01-01' then
    raise exception 'workout_date_too_old' using errcode = '22023';
  end if;
end;
$$;

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
    'is_backdated', ws.is_backdated,
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

-- The two-argument version is replaced by one with an optional performed-at date.
drop function if exists public.start_session(uuid, uuid);

create or replace function public.start_session(
  p_session_id uuid,
  p_template_id uuid,
  p_performed_at timestamptz default null
)
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

  perform public.assert_valid_workout_date(p_performed_at);

  select * into v_tpl from public.workout_templates where id = p_template_id and user_id = v_user;
  if not found then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  select * into v_split from public.splits where id = v_tpl.split_id;

  insert into public.workout_sessions
    (id, user_id, split_id, template_id, split_name, template_name, started_at, is_backdated)
  values (p_session_id, v_user, v_split.id, v_tpl.id, v_split.name, v_tpl.name,
    coalesce(p_performed_at, now()), p_performed_at is not null);

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
  -- A workout logged for an earlier date is recorded at that date, not when it was entered.
  set status = 'completed',
      completed_at = case when is_backdated then started_at else now() end,
      revision = revision + 1
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object('status', 'completed', 'revision', v_session.revision);
end;
$$;

-- Sets the date/time a workout was performed.
--   * In progress: the session becomes a past workout performed at p_performed_at.
--   * Completed: the workout is moved so it completed at p_performed_at, keeping its duration.
-- Does not change the sync revision: the date is not part of the synced document, so an open
-- logger on another device is not forced into a conflict.
create or replace function public.set_session_date(p_session_id uuid, p_performed_at timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.workout_sessions;
begin
  if p_performed_at is null then
    raise exception 'workout_date_required' using errcode = '22023';
  end if;
  perform public.assert_valid_workout_date(p_performed_at);

  select * into v_session from public.workout_sessions
  where id = p_session_id and user_id = v_user
  for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status = 'in_progress' then
    update public.workout_sessions
    set started_at = p_performed_at, is_backdated = true
    where id = p_session_id
    returning * into v_session;
  elsif v_session.status = 'completed' then
    update public.workout_sessions
    set started_at = p_performed_at - (completed_at - started_at),
        completed_at = p_performed_at
    where id = p_session_id
    returning * into v_session;
  else
    raise exception 'session_discarded' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'started_at', v_session.started_at,
    'completed_at', v_session.completed_at,
    'is_backdated', v_session.is_backdated
  );
end;
$$;

revoke execute on function public.assert_valid_workout_date(timestamptz) from public, anon;
revoke execute on function public.start_session(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.set_session_date(uuid, timestamptz) from public, anon;
revoke execute on function public.session_document(uuid) from public, anon;
revoke execute on function public.finish_session(uuid, integer) from public, anon;
grant execute on function
  public.assert_valid_workout_date(timestamptz),
  public.start_session(uuid, uuid, timestamptz),
  public.set_session_date(uuid, timestamptz),
  public.session_document(uuid),
  public.finish_session(uuid, integer)
to authenticated;
