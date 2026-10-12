-- Activation reporting for the admin dashboard, by sign-up cohort.
--
-- A cohort is everyone who signed up in the chosen window, minus admins and accounts the owner
-- marks as test accounts. For each person it records how far they got:
--   confirmed email → activated a split → first workout → a second workout on another day
--   (within 7 and within 14 days of signing up) → paid.
-- A workout counts only when it was finished with at least one confirmed working set, and a
-- second workout must be logged on a different day (UK time) from the first, so trying the
-- app twice in one sitting doesn't count as coming back.
--
-- Additive: one table and new functions. admin_overview() is unchanged.

create table public.analytics_excluded_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
alter table public.analytics_excluded_users enable row level security;
revoke all on public.analytics_excluded_users from anon, authenticated;

-- Marks an account as a test account (left out of activation reporting), or includes it again.
create or replace function public.admin_set_test_account(p_email text, p_excluded boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if p_excluded then
    insert into public.analytics_excluded_users (user_id) values (v_user) on conflict do nothing;
  else
    delete from public.analytics_excluded_users where user_id = v_user;
  end if;
  return jsonb_build_object('result', case when p_excluded then 'excluded' else 'included' end);
end;
$$;

-- Activation by sign-up cohort, overall and per campaign. Admins only; totals and the list of
-- excluded test accounts (which the admin manages) only.
create or replace function public.admin_activation(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  v_since := date_trunc('day', now()) - make_interval(days => v_days - 1);

  with
  cohort as (
    select u.id, u.created_at, u.email_confirmed_at,
      public.source_label(a.utm_source, a.referrer_host, coalesce(a.from_meta_ad, false)) as source,
      coalesce(a.utm_campaign, '') as campaign
    from auth.users u
    left join public.user_attribution a on a.user_id = u.id
    where u.created_at >= v_since
      and u.id not in (select user_id from public.admins)
      and u.id not in (select user_id from public.analytics_excluded_users)
  ),
  -- Finished workouts with at least one confirmed working set.
  workouts as (
    select ws.user_id, ws.id, ws.created_at,
      (ws.created_at at time zone 'Europe/London')::date as day,
      min(ss.completed_at) as first_set_at
    from public.workout_sessions ws
    join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
    join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
    where ws.user_id in (select id from cohort)
      and ws.status = 'completed'
      and ss.completed_at is not null
      and ss.set_type = 'working'
    group by ws.user_id, ws.id, ws.created_at
  ),
  firsts as (
    select distinct on (user_id) user_id, day as first_day, first_set_at
    from workouts order by user_id, created_at
  ),
  -- The earliest workout logged on a later day than the first.
  seconds as (
    select w.user_id, min(w.created_at) as second_at
    from workouts w join firsts f using (user_id)
    where w.day > f.first_day
    group by w.user_id
  ),
  people as (
    select c.id, c.source, c.campaign,
      c.email_confirmed_at is not null as confirmed,
      exists (select 1 from public.split_active_periods p where p.user_id = c.id) as split,
      f.user_id is not null as first_workout,
      greatest(extract(epoch from (f.first_set_at - c.created_at)) / 60, 0) as minutes_to_first_set,
      c.created_at <= now() - interval '7 days' as eligible7,
      c.created_at <= now() - interval '14 days' as eligible14,
      s.second_at < c.created_at + interval '7 days' as second7,
      s.second_at < c.created_at + interval '14 days' as second14,
      s.user_id is not null as second_any,
      exists (select 1 from public.payments p where p.user_id = c.id)
        or exists (select 1 from public.memberships m where m.user_id = c.id and m.status = 'paid') as paid
    from cohort c
    left join firsts f on f.user_id = c.id
    left join seconds s on s.user_id = c.id
  )
  select jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'excluded_accounts', (select count(*) from public.analytics_excluded_users),
    'totals', (
      select jsonb_build_object(
        'signups', count(*),
        'confirmed', count(*) filter (where confirmed),
        'split', count(*) filter (where split),
        'first_workout', count(*) filter (where first_workout),
        'second_any', count(*) filter (where second_any),
        'eligible7', count(*) filter (where eligible7),
        'second7', count(*) filter (where eligible7 and coalesce(second7, false)),
        'eligible14', count(*) filter (where eligible14),
        'second14', count(*) filter (where eligible14 and coalesce(second14, false)),
        'paid', count(*) filter (where paid),
        'median_minutes_to_first_set', round((percentile_cont(0.5) within group (order by minutes_to_first_set))::numeric, 1)
      )
      from people
    ),
    'campaigns', (
      select coalesce(jsonb_agg(row_to_json(c) order by c.signups desc, c.source, c.campaign), '[]'::jsonb)
      from (
        select source, campaign,
          count(*) as signups,
          count(*) filter (where split) as split,
          count(*) filter (where first_workout) as first_workout,
          count(*) filter (where eligible7) as eligible7,
          count(*) filter (where eligible7 and coalesce(second7, false)) as second7,
          count(*) filter (where eligible14) as eligible14,
          count(*) filter (where eligible14 and coalesce(second14, false)) as second14,
          count(*) filter (where paid) as paid
        from people
        group by source, campaign
        order by count(*) desc
        limit 50
      ) c
    ),
    'test_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'note', x.note) order by x.created_at desc), '[]'::jsonb)
      from public.analytics_excluded_users x join auth.users u on u.id = x.user_id
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_set_test_account(text, boolean), public.admin_activation(integer) from public, anon;
grant execute on function public.admin_set_test_account(text, boolean), public.admin_activation(integer) to authenticated;
