-- Bringing training history over from another app (Strong, Hevy).
--
-- The file is read in the browser, which matches each exercise to the catalogue (or the
-- member's own custom exercises) and sends finished workouts here in batches. Each workout
-- carries an import key (source + date + name), so importing the same file twice, or retrying
-- a batch after a dropped connection, never duplicates a workout.
--
-- Imported workouts are ordinary completed, backdated sessions: history, previous sets,
-- records and targets read them like any other. Like starting a workout, importing needs a
-- membership that allows logging.
--
-- Additive: one column, one index and one function.

alter table public.workout_sessions add column if not exists import_key text
  check (import_key is null or char_length(import_key) between 1 and 200);

create unique index if not exists workout_sessions_import_key
  on public.workout_sessions (user_id, import_key) where import_key is not null;

-- p_exercises: custom exercises to create, [{key, name, primary_muscle, equipment, tracking_mode}].
--   A custom exercise of the member's with the same name is reused instead.
-- p_sessions: [{key, name, started_at, notes, exercises: [{exercise_id | exercise_key, notes,
--   superset_next, sets: [{set_type, weight_kg, reps}]}]}]
-- Returns {imported, skipped, exercises: {key: id}}. Runs as the member, so RLS and the
-- ownership foreign keys apply as they do to the logger.
create or replace function public.import_workouts(p_source text, p_exercises jsonb, p_sessions jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_map jsonb := '{}'::jsonb;
  v_ex jsonb;
  v_ex_id uuid;
  v_session jsonb;
  v_session_id uuid;
  v_at timestamptz;
  v_entry jsonb;
  v_entry_id uuid;
  v_set jsonb;
  v_pos integer;
  v_set_pos integer;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source not in ('strong', 'hevy') then
    raise exception 'import_source_unknown' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_exercises, '[]')) <> 'array' or jsonb_typeof(coalesce(p_sessions, '[]')) <> 'array'
     or jsonb_array_length(coalesce(p_exercises, '[]')) > 300 or jsonb_array_length(coalesce(p_sessions, '[]')) > 100 then
    raise exception 'import_batch_too_large' using errcode = '22023';
  end if;

  for v_ex in select * from jsonb_array_elements(coalesce(p_exercises, '[]')) loop
    select id into v_ex_id from public.exercises
    where owner_id = v_user and archived_at is null and variant is null and lower(btrim(name)) = lower(btrim(v_ex ->> 'name'))
    order by created_at limit 1;
    if v_ex_id is null then
      insert into public.exercises (owner_id, name, primary_muscle, equipment, tracking_mode)
      values (v_user, btrim(v_ex ->> 'name'), v_ex ->> 'primary_muscle', v_ex ->> 'equipment', v_ex ->> 'tracking_mode')
      returning id into v_ex_id;
    end if;
    v_map := v_map || jsonb_build_object(v_ex ->> 'key', v_ex_id);
  end loop;

  for v_session in select * from jsonb_array_elements(coalesce(p_sessions, '[]')) loop
    v_at := (v_session ->> 'started_at')::timestamptz;
    perform public.assert_valid_workout_date(v_at);
    if jsonb_array_length(coalesce(v_session -> 'exercises', '[]')) > 60 then
      raise exception 'import_workout_too_large' using errcode = '22023';
    end if;

    v_session_id := null;
    insert into public.workout_sessions (user_id, template_name, status, started_at, completed_at, is_backdated, notes, import_key)
    values (
      v_user,
      coalesce(nullif(left(btrim(v_session ->> 'name'), 60), ''), 'Imported workout'),
      'completed', v_at, v_at, true,
      nullif(left(btrim(coalesce(v_session ->> 'notes', '')), 2000), ''),
      p_source || ':' || left(v_session ->> 'key', 180)
    )
    on conflict (user_id, import_key) where import_key is not null do nothing
    returning id into v_session_id;

    if v_session_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_imported := v_imported + 1;

    v_pos := 0;
    for v_entry in select * from jsonb_array_elements(coalesce(v_session -> 'exercises', '[]')) loop
      v_ex_id := coalesce((v_entry ->> 'exercise_id')::uuid, (v_map ->> (v_entry ->> 'exercise_key'))::uuid);
      if v_ex_id is null then
        raise exception 'import_exercise_missing' using errcode = '22023';
      end if;
      if jsonb_array_length(coalesce(v_entry -> 'sets', '[]')) > 100 then
        raise exception 'import_workout_too_large' using errcode = '22023';
      end if;

      v_entry_id := null;
      insert into public.session_exercises (user_id, session_id, exercise_id, position, exercise_name, notes, superset_next)
      select v_user, v_session_id, e.id, v_pos, left(e.name || coalesce(' · ' || e.variant, ''), 120),
        nullif(left(btrim(coalesce(v_entry ->> 'notes', '')), 1000), ''),
        coalesce((v_entry ->> 'superset_next')::boolean, false)
      from public.exercises e where e.id = v_ex_id
      returning id into v_entry_id;
      if v_entry_id is null then
        raise exception 'exercise_not_available' using errcode = '42501';
      end if;

      v_set_pos := 0;
      for v_set in select * from jsonb_array_elements(coalesce(v_entry -> 'sets', '[]')) loop
        insert into public.session_sets (user_id, session_exercise_id, position, set_type, weight_kg, reps, completed_at)
        values (
          v_user, v_entry_id, v_set_pos,
          case when v_set ->> 'set_type' = 'warmup' then 'warmup' else 'working' end,
          (v_set ->> 'weight_kg')::numeric, (v_set ->> 'reps')::integer, v_at
        );
        v_set_pos := v_set_pos + 1;
      end loop;
      if v_set_pos = 0 then
        update public.session_exercises set skipped = true where id = v_entry_id;
      end if;
      v_pos := v_pos + 1;
    end loop;
  end loop;

  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped, 'exercises', v_map);
end;
$$;

revoke execute on function public.import_workouts(text, jsonb, jsonb) from public, anon;
grant execute on function public.import_workouts(text, jsonb, jsonb) to authenticated;
