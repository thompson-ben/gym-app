-- When people visit, sign up and train, by hour of day and day of week (UK time), for the
-- admin dashboard. Uses what's already stored (visit times, account creation times, finished
-- workouts); nothing new is collected.
--
-- Same rules as the rest of the dashboard: visits are everyone; sign-ups and workouts leave out
-- admins, free-access friends and test accounts unless ticked under "Also count".
--
-- Additive: one new function.

create or replace function public.admin_time_of_day(p_days integer default 30, p_include text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365) - 1);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (
    with times as (
      select 'visits' as kind, e.created_at at time zone 'Europe/London' as at
      from public.analytics_events e
      where e.name = 'visit' and e.created_at >= v_since
      union all
      select 'signups', u.created_at at time zone 'Europe/London'
      from auth.users u
      where u.created_at >= v_since
        and u.id not in (select user_id from public.admin_excluded_users(p_include))
      union all
      -- When a workout was finished (backdated ones are left out: their time was typed in).
      select 'workouts', ws.completed_at at time zone 'Europe/London'
      from public.workout_sessions ws
      where ws.status = 'completed' and not ws.is_backdated and ws.completed_at >= v_since
        and ws.user_id not in (select user_id from public.admin_excluded_users(p_include))
    ),
    kinds as (select unnest(array['visits', 'signups', 'workouts']) as kind)
    select jsonb_object_agg(k.kind, jsonb_build_object(
      'by_hour', (
        select jsonb_agg((select count(*) from times t where t.kind = k.kind and extract(hour from t.at) = h) order by h)
        from generate_series(0, 23) h
      ),
      -- 1 = Monday … 7 = Sunday.
      'by_weekday', (
        select jsonb_agg((select count(*) from times t where t.kind = k.kind and extract(isodow from t.at) = d) order by d)
        from generate_series(1, 7) d
      )
    ))
    from kinds k
  );
end;
$$;

revoke execute on function public.admin_time_of_day(integer, text[]) from public, anon;
grant execute on function public.admin_time_of_day(integer, text[]) to authenticated;
