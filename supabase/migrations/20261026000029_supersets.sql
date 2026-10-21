-- Supersets: two or three exercises done back to back as one round.
--
-- template_exercises.superset_next links an exercise to the one after it in the workout; a run
-- of linked exercises is one superset (A1, A2, A3). The flag on the last one in a workout is
-- ignored. Sessions snapshot it when they start (start_session), like the rest of the plan,
-- and session_document returns it. sync_session is unchanged: it never writes the column, so
-- a session keeps the links it started with, and exercises added mid-workout aren't linked.
-- Shared, copied, duplicated and ready-made splits carry the links.
--
-- Additive: two boolean columns (default false) and the same functions with the new column.
-- History, previous performance, records and targets stay per exercise and are untouched.

alter table public.template_exercises add column if not exists superset_next boolean not null default false;
alter table public.session_exercises add column if not exists superset_next boolean not null default false;

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
        'superset_next', se.superset_next,
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
    target_sets, rep_min, rep_max, rest_seconds, template_notes, superset_next
  )
  select v_user, p_session_id, te.exercise_id, te.id, te.position,
    left(e.name || coalesce(' · ' || e.variant, ''), 120),
    te.target_sets, te.rep_min, te.rep_max, te.rest_seconds, te.notes, te.superset_next
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
            'superset_next', te.superset_next,
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
        target_sets, rep_min, rep_max, rest_seconds, notes, superset_next)
      values (v_user, v_tpl, v_exercise, v_x_pos,
        (v_x ->> 'target_sets')::smallint, (v_x ->> 'rep_min')::smallint,
        (v_x ->> 'rep_max')::smallint, (v_x ->> 'rest_seconds')::integer, v_x ->> 'notes',
        coalesce((v_x ->> 'superset_next')::boolean, false));
      v_x_pos := v_x_pos + 1;
    end loop;
  end loop;
  return v_split;
end;
$$;

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
      (user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
       progression_enabled, progression_increment_kg, superset_next)
    select v_user, v_new_tpl, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
      progression_enabled, progression_increment_kg, superset_next
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
    (user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
       progression_enabled, progression_increment_kg, superset_next)
  select v_user, v_new, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
      progression_enabled, progression_increment_kg, superset_next
  from public.template_exercises where template_id = p_template_id;
  return v_new;
end;
$$;

create or replace function public.create_split_from_plan(p_plan jsonb, p_activate boolean default false)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_split uuid;
  v_tpl uuid;
  v_workout jsonb;
  v_exercise jsonb;
  v_exercise_id uuid;
  v_w integer := 0;
  v_e integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_plan -> 'workouts') <> 'array'
     or jsonb_array_length(p_plan -> 'workouts') not between 1 and 7 then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;

  insert into public.splits (name, description)
  values (left(btrim(p_plan ->> 'name'), 60), nullif(left(btrim(coalesce(p_plan ->> 'description', '')), 500), ''))
  returning id into v_split;

  for v_workout in select * from jsonb_array_elements(p_plan -> 'workouts') loop
    if jsonb_typeof(v_workout -> 'exercises') <> 'array'
       or jsonb_array_length(v_workout -> 'exercises') not between 1 and 15 then
      raise exception 'invalid_plan' using errcode = '22023';
    end if;
    insert into public.workout_templates (split_id, name, position)
    values (v_split, left(btrim(v_workout ->> 'name'), 60), v_w)
    returning id into v_tpl;
    v_w := v_w + 1;
    v_e := 0;
    for v_exercise in select * from jsonb_array_elements(v_workout -> 'exercises') loop
      select id into v_exercise_id from public.exercises
      where slug = v_exercise ->> 'slug' and owner_id is null and archived_at is null;
      if v_exercise_id is null then
        raise exception 'unknown_exercise: %', v_exercise ->> 'slug' using errcode = '22023';
      end if;
      insert into public.template_exercises (template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, superset_next)
      values (
        v_tpl, v_exercise_id, v_e,
        coalesce((v_exercise ->> 'sets')::smallint, 2),
        (v_exercise ->> 'rep_min')::smallint,
        (v_exercise ->> 'rep_max')::smallint,
        (v_exercise ->> 'rest_seconds')::integer,
        coalesce((v_exercise ->> 'superset_next')::boolean, false)
      );
      v_e := v_e + 1;
    end loop;
  end loop;

  if p_activate then
    perform public.activate_split(v_split);
  end if;
  return v_split;
end;
$$;
