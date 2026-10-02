-- Optional next-session targets (double progression), opt-in per workout entry.
--
-- Additive only: two nullable/defaulted columns and one read-only function. Existing rows get
-- progression_enabled = false, so nothing changes for anyone until they switch it on. No
-- session data is touched: targets are computed from completed history when needed and are
-- never stored as sets, so they cannot be mistaken for (or retroactively become) results.
--
-- Rollout: apply this migration before deploying the app version that reads these columns.
-- App versions without this feature ignore the columns.

alter table public.template_exercises
  add column if not exists progression_enabled boolean not null default false,
  add column if not exists progression_increment_kg numeric(5, 2)
    check (progression_increment_kg is null or (progression_increment_kg > 0 and progression_increment_kg <= 50));

comment on column public.template_exercises.progression_enabled is
  'User opted in to next-session targets for this workout entry.';
comment on column public.template_exercises.progression_increment_kg is
  'Weight the user adds once every working set reaches the top of the rep range. Chosen by the user; never defaulted.';

-- Duplicating a split or workout keeps the entry''s target settings.
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
       progression_enabled, progression_increment_kg)
    select v_user, v_new_tpl, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
      progression_enabled, progression_increment_kg
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
       progression_enabled, progression_increment_kg)
  select v_user, v_new, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes,
      progression_enabled, progression_increment_kg
  from public.template_exercises where template_id = p_template_id;
  return v_new;
end;
$$;

-- Recent comparable candidates for next-session targets: for each exercise, the latest
-- completed performances (one row per session exercise, not merged across entries), each with
-- the prescription that was in force at the time (the session snapshot) and its completed
-- sets in order. Skipped entries and entries without completed sets are excluded.
-- SECURITY INVOKER: RLS limits rows to the caller.
create or replace function public.progression_candidates(
  p_exercise_ids uuid[],
  p_before timestamptz default null,
  p_limit integer default 6
)
returns table (
  exercise_id uuid,
  session_exercise_id uuid,
  template_exercise_id uuid,
  session_id uuid,
  completed_at timestamptz,
  template_name text,
  target_sets smallint,
  rep_min smallint,
  rep_max smallint,
  sets jsonb
)
language sql
stable
set search_path = ''
as $$
  select c.exercise_id, c.id, c.template_exercise_id, c.session_id, c.completed_at, c.template_name,
         c.target_sets, c.rep_min, c.rep_max, c.sets
  from (
    select se.exercise_id, se.id, se.template_exercise_id, ws.id as session_id, ws.completed_at,
           ws.template_name, se.target_sets, se.rep_min, se.rep_max,
           (
             select jsonb_agg(jsonb_build_object('set_type', ss.set_type, 'weight_kg', ss.weight_kg, 'reps', ss.reps)
                              order by ss.position, ss.created_at)
             from public.session_sets ss
             where ss.session_exercise_id = se.id and ss.completed_at is not null
           ) as sets,
           row_number() over (partition by se.exercise_id order by ws.completed_at desc, se.position desc) as rn
    from public.session_exercises se
    join public.workout_sessions ws on ws.id = se.session_id
    where se.user_id = auth.uid()
      and ws.user_id = auth.uid()
      and ws.status = 'completed'
      and not se.skipped
      and se.exercise_id = any (p_exercise_ids)
      and (p_before is null or ws.completed_at < p_before)
      and exists (select 1 from public.session_sets ss where ss.session_exercise_id = se.id and ss.completed_at is not null)
  ) c
  where c.rn <= least(greatest(coalesce(p_limit, 6), 1), 20)
  order by c.exercise_id, c.completed_at desc;
$$;

revoke execute on function public.progression_candidates(uuid[], timestamptz, integer) from public, anon;
grant execute on function public.progression_candidates(uuid[], timestamptz, integer) to authenticated;
