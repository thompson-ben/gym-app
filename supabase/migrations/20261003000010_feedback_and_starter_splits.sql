-- In-app feedback and starter splits.
--
-- Additive: one new table and one function. Nothing existing is changed.

-- Feedback from testers. Users can submit; only the owner reads it (SQL Editor / Table editor):
--   select f.created_at, u.email, f.kind, f.message, f.page from public.feedback f
--   join auth.users u on u.id = f.user_id order by f.created_at desc;
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  -- The screen the user was on, the app build and the device, to help reproduce problems.
  page text check (page is null or char_length(page) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 80),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy "feedback: submit own" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
-- No select, update or delete for users: feedback is write-only from the app.
revoke select, update, delete, truncate on public.feedback from anon, authenticated;
revoke all on public.feedback from anon;

-- The account deletion function removes feedback too (cascade from auth.users).

-- Creates a split from a plan in one transaction, e.g. a starter split chosen on first run:
--   { "name": "...", "description": "...",
--     "workouts": [ { "name": "...", "exercises": [ { "slug": "back-squat", "sets": 3,
--                     "rep_min": 6, "rep_max": 10, "rest_seconds": 150 } ] } ] }
-- Exercises are catalogue exercises referenced by slug. Optionally activates the split.
-- SECURITY INVOKER: every insert is checked by RLS as the calling user.
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
      insert into public.template_exercises (template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds)
      values (
        v_tpl, v_exercise_id, v_e,
        coalesce((v_exercise ->> 'sets')::smallint, 2),
        (v_exercise ->> 'rep_min')::smallint,
        (v_exercise ->> 'rep_max')::smallint,
        (v_exercise ->> 'rest_seconds')::integer
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

revoke execute on function public.create_split_from_plan(jsonb, boolean) from public, anon;
grant execute on function public.create_split_from_plan(jsonb, boolean) to authenticated;
