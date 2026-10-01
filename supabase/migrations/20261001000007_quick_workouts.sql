-- Quick (one-off) workouts.
--
-- A session can start without a template: no split, no planned exercises. Exercises are
-- added while logging, and history still follows each exercise as usual. A workout's name
-- (its snapshot label) can be changed by its owner.

create or replace function public.start_quick_session(
  p_session_id uuid,
  p_name text default null,
  p_performed_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.workout_sessions;
  v_name text := coalesce(nullif(btrim(p_name), ''), 'Quick workout');
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Idempotent: retrying with the same id returns the same session.
  select * into v_existing from public.workout_sessions where id = p_session_id and user_id = v_user;
  if found then
    return public.session_document(p_session_id);
  end if;
  if exists (select 1 from public.workout_sessions where user_id = v_user and status = 'in_progress') then
    raise exception 'session_in_progress' using errcode = '22023';
  end if;
  perform public.assert_valid_workout_date(p_performed_at);

  insert into public.workout_sessions (id, user_id, template_name, started_at, is_backdated)
  values (p_session_id, v_user, left(v_name, 60), coalesce(p_performed_at, now()), p_performed_at is not null);

  return public.session_document(p_session_id);
exception when unique_violation then
  if exists (select 1 from public.workout_sessions where id = p_session_id and user_id = v_user) then
    return public.session_document(p_session_id);
  end if;
  raise exception 'session_in_progress' using errcode = '22023';
end;
$$;

-- Renames a workout (its own label; templates are not affected).
create or replace function public.rename_session(p_session_id uuid, p_name text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'workout_name_required' using errcode = '22023';
  end if;
  update public.workout_sessions
  set template_name = left(btrim(p_name), 60)
  where id = p_session_id and user_id = auth.uid() and status <> 'discarded';
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.start_quick_session(uuid, text, timestamptz) from public, anon;
revoke execute on function public.rename_session(uuid, text) from public, anon;
grant execute on function public.start_quick_session(uuid, text, timestamptz), public.rename_session(uuid, text) to authenticated;
