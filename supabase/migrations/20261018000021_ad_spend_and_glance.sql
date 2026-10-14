-- Admin dashboard: ad spend (cost per result), an "at a glance" panel, the 14-day refund
-- window, and referral rewards that turned into payments.
--
-- Additive: one table, two columns on payments and new or replaced admin-only functions.
-- No user data changes.

-- ---------------------------------------------------------------------------
-- Ad spend, typed in from Ads Manager
-- ---------------------------------------------------------------------------

-- One entry covers a date range (a single day, or e.g. a whole week). Reports spread it evenly
-- over its days, so any dashboard range gets its fair share. An empty ad means the whole
-- campaign; otherwise it's the ad's utm_content.
create table public.ad_spend (
  id bigint generated always as identity primary key,
  start_day date not null,
  end_day date not null,
  campaign text not null check (char_length(btrim(campaign)) between 1 and 150),
  content text not null default '' check (char_length(content) <= 150),
  amount_pence integer not null check (amount_pence between 1 and 100000000),
  created_at timestamptz not null default now(),
  check (end_day >= start_day and end_day - start_day <= 366)
);
alter table public.ad_spend enable row level security;
revoke all on public.ad_spend from anon, authenticated;

create or replace function public.admin_add_ad_spend(p_start date, p_end date, p_campaign text, p_content text, p_amount_pence integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  insert into public.ad_spend (start_day, end_day, campaign, content, amount_pence)
  values (p_start, coalesce(p_end, p_start), btrim(p_campaign), btrim(coalesce(p_content, '')), p_amount_pence)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_ad_spend(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from public.ad_spend where id = p_id;
end;
$$;

-- Spend in the range against what it brought, per campaign and per ad. Sign-ups are accounts
-- created in the range with that campaign (and ad) in their first touch; "activated" means
-- they have finished a workout with a confirmed working set; "paid" means they have paid.
-- Days are UK days. Admins and test accounts are left out.
create or replace function public.admin_ad_spend(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_to date := (now() at time zone 'Europe/London')::date;
  v_from date := v_to - (v_days - 1);
  v_since timestamptz := (v_from::timestamp at time zone 'Europe/London');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  with
  spend as (
    select campaign, content,
      sum(amount_pence::numeric
        * greatest(0, least(end_day, v_to) - greatest(start_day, v_from) + 1)
        / (end_day - start_day + 1)) as pence
    from public.ad_spend
    where end_day >= v_from and start_day <= v_to
    group by campaign, content
  ),
  people as (
    select u.id, a.utm_campaign as campaign, coalesce(a.utm_content, '') as content,
      exists (
        select 1 from public.workout_sessions ws
        join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where ws.user_id = u.id and ws.status = 'completed' and ss.completed_at is not null and ss.set_type = 'working'
      ) as activated,
      exists (select 1 from public.payments p where p.user_id = u.id)
        or exists (select 1 from public.memberships m where m.user_id = u.id and m.status = 'paid') as paid
    from auth.users u
    join public.user_attribution a on a.user_id = u.id
    where u.created_at >= v_since
      and a.utm_campaign is not null
      and u.id not in (select user_id from public.admins)
      and u.id not in (select user_id from public.analytics_excluded_users)
  ),
  visits as (
    select utm_campaign as campaign, coalesce(utm_content, '') as content, count(*) as n
    from public.analytics_events
    where name = 'visit' and created_at >= v_since and utm_campaign is not null
    group by 1, 2
  ),
  keys as (
    select campaign, content from spend
    union select campaign, content from people
    union select campaign, content from visits
  ),
  -- Campaigns with any spend, plus their ads.
  spent_campaigns as (select distinct campaign from spend)
  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'to', v_to,
    'campaigns', coalesce((
      select jsonb_agg(c order by c ->> 'campaign')
      from (
        select jsonb_build_object(
          'campaign', k.campaign,
          'spend_pence', round(coalesce((select sum(pence) from spend s where s.campaign = k.campaign), 0)),
          'visits', coalesce((select sum(n) from visits v where v.campaign = k.campaign), 0),
          'signups', (select count(*) from people p where p.campaign = k.campaign),
          'activated', (select count(*) from people p where p.campaign = k.campaign and p.activated),
          'paid', (select count(*) from people p where p.campaign = k.campaign and p.paid),
          'ads', coalesce((
            select jsonb_agg(jsonb_build_object(
              'content', a.content,
              'spend_pence', (select round(sum(pence)) from spend s where s.campaign = k.campaign and s.content = a.content),
              'visits', coalesce((select sum(n) from visits v where v.campaign = k.campaign and v.content = a.content), 0),
              'signups', (select count(*) from people p where p.campaign = k.campaign and p.content = a.content),
              'activated', (select count(*) from people p where p.campaign = k.campaign and p.content = a.content and p.activated),
              'paid', (select count(*) from people p where p.campaign = k.campaign and p.content = a.content and p.paid)
            ) order by a.content)
            from (select distinct content from keys where campaign = k.campaign and content <> '') a
          ), '[]'::jsonb)
        ) as c
        from (select distinct campaign from keys where campaign in (select campaign from spent_campaigns)) k
      ) x
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'start_day', start_day, 'end_day', end_day, 'campaign', campaign, 'content', content,
        'amount_pence', amount_pence) order by end_day desc, id desc)
      from (select * from public.ad_spend order by end_day desc, id desc limit 30) e
    ), '[]'::jsonb),
    'known', coalesce((
      select jsonb_agg(distinct jsonb_build_object('campaign', campaign, 'content', content))
      from (
        select utm_campaign as campaign, coalesce(utm_content, '') as content from public.analytics_events
        where name = 'visit' and utm_campaign is not null and created_at > now() - interval '90 days'
        union select campaign, content from public.ad_spend
      ) kc
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- The 14-day refund window
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists refunded_at timestamptz;

-- First payments (the ones the 14-day right to cancel applies to) made in the last 14 days and
-- not refunded: money that may still have to go back.
create or replace function public.admin_refund_window()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (
    with firsts as (
      select distinct on (p.user_id) p.*
      from public.payments p
      where p.user_id is not null
      order by p.user_id, p.paid_at
    )
    select jsonb_build_object(
      'total_pence', coalesce(sum(f.amount_pence) filter (where f.refunded_at is null), 0),
      'count', count(*) filter (where f.refunded_at is null),
      'payments', coalesce(jsonb_agg(jsonb_build_object(
          'id', f.id, 'email', u.email, 'amount_pence', f.amount_pence, 'plan', f.plan, 'paid_at', f.paid_at,
          'window_ends', f.paid_at + interval '14 days', 'refunded_at', f.refunded_at
        ) order by f.paid_at), '[]'::jsonb)
    )
    from firsts f
    left join auth.users u on u.id = f.user_id
    where f.paid_at > now() - interval '14 days'
  );
end;
$$;

create or replace function public.admin_mark_refunded(p_payment bigint, p_refunded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.payments set refunded_at = case when p_refunded then now() end where id = p_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- At a glance: yesterday and what's coming up
-- ---------------------------------------------------------------------------

create or replace function public.admin_glance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_y_start timestamptz := ((v_today - 1)::timestamp at time zone 'Europe/London');
  v_y_end timestamptz := (v_today::timestamp at time zone 'Europe/London');
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'yesterday', v_today - 1,
    'visits', (select count(*) from public.analytics_events where name = 'visit' and created_at >= v_y_start and created_at < v_y_end),
    'signups', (
      select count(*) from auth.users u
      where u.created_at >= v_y_start and u.created_at < v_y_end
        and u.id not in (select user_id from public.admins)
        and u.id not in (select user_id from public.analytics_excluded_users)
    ),
    -- People whose first finished workout (with a confirmed working set) was yesterday.
    'first_workouts', (
      select count(*) from (
        select ws.user_id, min(ws.completed_at) as first_at
        from public.workout_sessions ws
        join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where ws.status = 'completed' and ss.completed_at is not null and ss.set_type = 'working'
          and ws.user_id not in (select user_id from public.admins)
          and ws.user_id not in (select user_id from public.analytics_excluded_users)
        group by ws.user_id
      ) f where f.first_at >= v_y_start and f.first_at < v_y_end
    ),
    'payments', (select count(*) from public.payments where paid_at >= v_y_start and paid_at < v_y_end),
    'revenue_pence', (select coalesce(sum(amount_pence), 0) from public.payments where paid_at >= v_y_start and paid_at < v_y_end),
    'trials_ending_3d', (
      select count(*) from public.memberships
      where status = 'trial' and trial_ends_at > now() and trial_ends_at <= now() + interval '3 days'
    ),
    'cancelling', (select count(*) from public.memberships where status = 'paid' and cancel_at_period_end),
    'billing_issues', (select count(*) from public.memberships where status = 'paid' and billing_issue),
    'new_comments', (
      (select count(*) from public.survey_answers where detail is not null and created_at > now() - interval '24 hours')
      + (select count(*) from public.feedback where created_at > now() - interval '24 hours')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Referrals: also how many rewarded members went on to pay
-- ---------------------------------------------------------------------------

create or replace function public.admin_referrals(p_days integer default 30)
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
  return jsonb_build_object(
    'sharers', (select count(*) from public.referral_codes),
    'referred', (select count(*) from public.referrals where created_at >= v_since),
    'by_link', (select count(*) from public.referrals where created_at >= v_since and via = 'link'),
    'by_group', (select count(*) from public.referrals where created_at >= v_since and via = 'group'),
    'by_split', (select count(*) from public.referrals where created_at >= v_since and via = 'split'),
    'qualified', (select count(*) from public.referrals where created_at >= v_since and qualified_at is not null),
    'rewards', (select count(*) from public.referrals where rewarded_at >= v_since),
    'rewards_all_time', (select count(*) from public.referrals where rewarded_at is not null),
    'rewarded_paid', (
      select count(*) from public.referrals r
      where r.rewarded_at is not null
        and (exists (select 1 from public.payments p where p.user_id = r.referrer_id)
             or exists (select 1 from public.memberships m where m.user_id = r.referrer_id and m.status = 'paid'))
    ),
    'referred_paid', (
      select count(*) from public.referrals r
      where r.created_at >= v_since
        and (exists (select 1 from public.payments p where p.user_id = r.referred_id)
             or exists (select 1 from public.memberships m where m.user_id = r.referred_id and m.status = 'paid'))
    )
  );
end;
$$;

revoke execute on function
  public.admin_add_ad_spend(date, date, text, text, integer), public.admin_delete_ad_spend(bigint), public.admin_ad_spend(integer),
  public.admin_refund_window(), public.admin_mark_refunded(bigint, boolean), public.admin_glance(), public.admin_referrals(integer)
from public, anon;
grant execute on function
  public.admin_add_ad_spend(date, date, text, text, integer), public.admin_delete_ad_spend(bigint), public.admin_ad_spend(integer),
  public.admin_refund_window(), public.admin_mark_refunded(bigint, boolean), public.admin_glance(), public.admin_referrals(integer)
to authenticated;
