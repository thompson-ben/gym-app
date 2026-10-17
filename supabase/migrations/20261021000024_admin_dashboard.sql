-- A simpler admin dashboard with one rule for who is counted.
--
-- admin_dashboard(p_days, p_include) returns everything the top of the dashboard shows:
-- all-time overview, the chosen period, one sign-up-to-paid funnel, sources grouped into a few
-- channels, sharing, and trial outcomes. Admins, free-access friends and test accounts are left
-- out unless named in p_include ('admins', 'friends', 'tests'). Anonymous visits can't be
-- split this way and are always counted.
--
-- Additive: new functions only. The existing admin_* functions are unchanged.

-- Accounts to leave out of the figures.
create or replace function public.admin_excluded_users(p_include text[])
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.admins a
  where not ('admins' = any (coalesce(p_include, '{}')))
  union
  select x.user_id from public.analytics_excluded_users x
  where not ('tests' = any (coalesce(p_include, '{}')))
  union
  -- Friends given free access (admins also have free access, but count as admins).
  select m.user_id from public.memberships m
  where m.free_access and m.user_id not in (select a.user_id from public.admins a)
    and not ('friends' = any (coalesce(p_include, '{}')))
$$;

-- A handful of channels instead of every spelling of every source.
create or replace function public.source_group(p_source text, p_medium text, p_campaign text, p_referrer_host text, p_meta boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  with v as (
    select lower(coalesce(p_source, '')) as s,
      lower(coalesce(p_medium, '')) as m,
      coalesce(p_campaign, '') as c,
      lower(regexp_replace(coalesce(p_referrer_host, ''), '^(www\.|m\.|l\.|lm\.)', '')) as h
  )
  select case
    when s in ('referral', 'group-invite', 'split-share') then 'shares'
    when m in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad')
      or (s in ('facebook', 'fb', 'ig', 'instagram', 'meta', 'an', 'msg') and c <> '' and m not in ('bio', 'story', 'post', 'reel', 'social', 'organic'))
      then 'meta_ads'
    when s in ('instagram', 'ig') or h like '%instagram.com' then 'instagram'
    when s in ('facebook', 'fb') or h like '%facebook.com' or h = 'fb.me' or coalesce(p_meta, false) then 'facebook'
    when s in ('google', 'bing') or h ~ '(^|\.)(google|bing|duckduckgo|yahoo|ecosia)\.' then 'search'
    when s = '' and h = '' then 'direct'
    else 'other'
  end
  from v
$$;

create or replace function public.admin_dashboard(p_days integer default 30, p_include text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365) - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  with
  excluded as (select user_id from public.admin_excluded_users(p_include)),
  people as (
    select u.id, u.created_at, u.email_confirmed_at
    from auth.users u
    where u.id not in (select user_id from excluded)
  ),
  -- Finished workouts with at least one confirmed working set ("trained").
  trained_sessions as (
    select ws.user_id, ws.id, ws.created_at, ws.completed_at
    from public.workout_sessions ws
    where ws.status = 'completed'
      and ws.user_id in (select id from people)
      and exists (
        select 1 from public.session_exercises se
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where se.session_id = ws.id and se.user_id = ws.user_id and ss.completed_at is not null and ss.set_type = 'working'
      )
  ),
  firsts as (
    select user_id, min(created_at) as first_at from trained_sessions group by user_id
  ),
  paid_people as (
    select distinct user_id from public.payments where user_id in (select id from people)
  ),
  cohort as (
    select p.id, p.created_at, p.email_confirmed_at,
      public.source_group(a.utm_source, a.utm_medium, a.utm_campaign, a.referrer_host, coalesce(a.from_meta_ad, false)) as channel,
      exists (select 1 from public.split_active_periods sp where sp.user_id = p.id) as split,
      f.first_at,
      exists (select 1 from paid_people pp where pp.user_id = p.id) as paid
    from people p
    left join public.user_attribution a on a.user_id = p.id
    left join firsts f on f.user_id = p.id
    where p.created_at >= v_since
  ),
  events as (
    select name, created_at,
      public.source_group(utm_source, utm_medium, utm_campaign, referrer_host, from_meta_ad) as channel,
      utm_source
    from public.analytics_events where created_at >= v_since
  ),
  members as (
    select m.* from public.memberships m where m.user_id in (select id from people)
  ),
  trials_ended as (
    select m.user_id, m.trial_ends_at, m.status,
      (m.status = 'paid' or exists (select 1 from paid_people pp where pp.user_id = m.user_id)) as converted,
      exists (select 1 from firsts f where f.user_id = m.user_id) as trained
    from members m
    where m.trial_ends_at is not null and m.trial_ends_at <= now()
  ),
  days as (
    select generate_series(v_since, date_trunc('day', now()), interval '1 day') as day
  ),
  channels as (
    select * from unnest(array['meta_ads', 'instagram', 'facebook', 'shares', 'search', 'direct', 'other']) with ordinality as c(channel, ord)
  )
  select jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'include', to_jsonb(coalesce(p_include, '{}')),
    'excluded', jsonb_build_object(
      'admins', (select count(*) from public.admins),
      'friends', (select count(*) from public.memberships m where m.free_access and m.user_id not in (select a.user_id from public.admins a)),
      'tests', (select count(*) from public.analytics_excluded_users)
    ),
    'overview', jsonb_build_object(
      'accounts', (select count(*) from people),
      'active_7d', (select count(distinct user_id) from trained_sessions where completed_at >= now() - interval '7 days'),
      'workouts_total', (select count(*) from trained_sessions),
      'paying', (select count(*) from members where status = 'paid'),
      'trials_running', (select count(*) from members where status = 'trial' and trial_ends_at > now()),
      'mrr_pence', (
        select coalesce(round(sum(case when p.plan = 'yearly' then p.amount_pence / 12.0 else p.amount_pence end)), 0)
        from members m
        join lateral (
          select amount_pence, plan from public.payments
          where user_id = m.user_id and currency = 'gbp' and refunded_at is null order by paid_at desc limit 1
        ) p on true
        where m.status = 'paid'
      )
    ),
    'period', jsonb_build_object(
      'visits', (select count(*) from events where name = 'visit'),
      'signups', (select count(*) from cohort),
      'first_workouts', (select count(*) from firsts where first_at >= v_since),
      'workouts', (select count(*) from trained_sessions where completed_at >= v_since),
      'active_users', (select count(distinct user_id) from trained_sessions where completed_at >= v_since),
      'revenue_pence', (
        select coalesce(sum(amount_pence), 0) from public.payments
        where currency = 'gbp' and refunded_at is null and paid_at >= v_since and user_id in (select id from people)
      ),
      'payments', (select count(*) from public.payments where paid_at >= v_since and refunded_at is null and user_id in (select id from people))
    ),
    'funnel', jsonb_build_object(
      'visits', (select count(*) from events where name = 'visit'),
      'signup_views', (select count(*) from events where name = 'signup_view'),
      'signups', (select count(*) from cohort),
      'confirmed', (select count(*) from cohort where email_confirmed_at is not null),
      'split', (select count(*) from cohort where split),
      'first_workout', (select count(*) from cohort where first_at is not null),
      'paid', (select count(*) from cohort where paid),
      -- Sign-up to starting a first workout that counted. Workouts logged for an earlier date
      -- still count from when they were entered.
      'median_minutes_to_first', (
        select round((percentile_cont(0.5) within group (order by extract(epoch from (first_at - created_at)) / 60))::numeric, 1)
        from cohort where first_at is not null and first_at >= created_at
      )
    ),
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel', ch.channel,
        'visits', (select count(*) from events e where e.name = 'visit' and e.channel = ch.channel),
        'signups', (select count(*) from cohort c where c.channel = ch.channel),
        'trained', (select count(*) from cohort c where c.channel = ch.channel and c.first_at is not null),
        'paid', (select count(*) from cohort c where c.channel = ch.channel and c.paid)
      ) order by ch.ord), '[]'::jsonb)
      from channels ch
    ),
    'shares', jsonb_build_object(
      'invite_links', (select count(*) from public.referral_codes r where r.created_at >= v_since and r.user_id in (select id from people)),
      'split_links', (select count(*) from public.split_shares s where s.created_at >= v_since and s.user_id in (select id from people)),
      'group_invites', (select count(*) from public.group_workouts g where g.created_at >= v_since and g.user_id in (select id from people)),
      'visits', jsonb_build_object(
        'link', (select count(*) from events where name = 'visit' and utm_source = 'referral'),
        'group', (select count(*) from events where name = 'visit' and utm_source = 'group-invite'),
        'split', (select count(*) from events where name = 'visit' and utm_source = 'split-share')
      ),
      'signups', (select count(*) from public.referrals r where r.created_at >= v_since and r.referred_id in (select id from people)),
      'trained', (select count(*) from public.referrals r where r.created_at >= v_since and r.qualified_at is not null and r.referred_id in (select id from people)),
      'paid', (select count(*) from public.referrals r where r.created_at >= v_since and r.referred_id in (select user_id from paid_people)),
      'rewards', (select count(*) from public.referrals r where r.rewarded_at >= v_since and r.referrer_id in (select id from people))
    ),
    'trials', jsonb_build_object(
      'ended', (select count(*) from trials_ended where trial_ends_at >= v_since),
      'converted', (select count(*) from trials_ended where trial_ends_at >= v_since and converted),
      'ended_all', (select count(*) from trials_ended),
      'converted_all', (select count(*) from trials_ended where converted),
      'running', (select count(*) from members where status = 'trial' and trial_ends_at > now()),
      'ending_7d', (select count(*) from members where status = 'trial' and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days'),
      -- Also counts people who paid before their trial ended.
      'paid_early', (select count(*) from members m where m.status = 'paid' and m.trial_ends_at > now()),
      'recent', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'email', u.email, 'ended_at', t.trial_ends_at, 'converted', t.converted, 'trained', t.trained,
          'workouts', (select count(*) from trained_sessions s where s.user_id = t.user_id)
        ) order by t.trial_ends_at desc), '[]'::jsonb)
        from (select * from trials_ended order by trial_ends_at desc limit 10) t
        join auth.users u on u.id = t.user_id
      )
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'visits', (select count(*) from events e where e.name = 'visit' and date_trunc('day', e.created_at) = d.day),
        'signups', (select count(*) from cohort c where date_trunc('day', c.created_at) = d.day),
        'workouts', (select count(*) from trained_sessions s where date_trunc('day', s.completed_at) = d.day)
      ) order by d.day), '[]'::jsonb)
      from days d
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_excluded_users(text[]), public.admin_dashboard(integer, text[]) from public, anon;
grant execute on function public.admin_dashboard(integer, text[]) to authenticated;
