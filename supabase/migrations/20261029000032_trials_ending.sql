-- Running trials by the day they end (UK days), and how many of those people have trained,
-- for the admin dashboard's Trials section. Uses what's already stored; nothing new is
-- collected. Same "Also count" rule as the rest of the dashboard.
--
-- Additive: one new function.

create or replace function public.admin_trials_ending(p_include text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (
    with running as (
      select (m.trial_ends_at at time zone 'Europe/London')::date as day, public.has_trained(m.user_id) as trained
      from public.memberships m
      where m.status = 'trial' and m.trial_ends_at > now()
        and m.user_id not in (select user_id from public.admin_excluded_users(p_include))
    )
    select jsonb_build_object(
      'running', (select count(*) from running),
      'trained', (select count(*) from running where trained),
      -- One entry per day with at least one trial ending, within the next 30 days.
      'by_day', coalesce((
        select jsonb_agg(jsonb_build_object('day', day, 'ending', ending, 'trained', trained) order by day)
        from (
          select day, count(*) as ending, count(*) filter (where trained) as trained
          from running
          where day <= v_today + 30
          group by day
        ) d
      ), '[]'::jsonb),
      'later', (select count(*) from running where day > v_today + 30)
    )
  );
end;
$$;

revoke execute on function public.admin_trials_ending(text[]) from public, anon;
grant execute on function public.admin_trials_ending(text[]) to authenticated;
