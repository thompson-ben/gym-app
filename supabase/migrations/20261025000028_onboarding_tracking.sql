-- Seeing where people stop before signing up, and what new accounts do next.
--
-- Five more anonymous events, with the same privacy rules as visits (migration 13): no
-- account, no ID, no details of what was typed. Each carries a short detail code and the page:
--   cta_click       which button was tapped (hero_start, hero_try, nav_start, final_start, …)
--   scroll_depth    how far down a page someone got (quarter, half, three_quarters, bottom)
--   signup_started  first tap into the create-account form
--   consent         the cookie-banner choice (accepted, declined)
--   demo_progress   how far the demo got (three_sets, finished)
-- admin_engagement summarises them, plus how many new accounts started a workout or logged
-- a set without finishing one (from the workout tables; nothing new is stored).
--
-- Additive: a wider event-name check, the same track_event with a longer list, one new function.

alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events
  add constraint analytics_events_name_check
  check (name in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start', 'demo_start', 'demo_set', 'demo_signup', 'cta_click', 'scroll_depth', 'signup_started', 'consent', 'demo_progress'));

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start', 'demo_start', 'demo_set', 'demo_signup', 'cta_click', 'scroll_depth', 'signup_started', 'consent', 'demo_progress') then
    return;
  end if;
  insert into public.analytics_events (
    name, path, referrer_host, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    from_meta_ad, device, country, detail, in_app
  ) values (
    p_name,
    public.clean_text(p_props ->> 'path', 200),
    lower(public.clean_text(p_props ->> 'referrer_host', 120)),
    lower(public.clean_text(p_props ->> 'utm_source', 100)),
    lower(public.clean_text(p_props ->> 'utm_medium', 100)),
    public.clean_text(p_props ->> 'utm_campaign', 150),
    public.clean_text(p_props ->> 'utm_content', 150),
    public.clean_text(p_props ->> 'utm_term', 150),
    coalesce((p_props ->> 'from_meta_ad')::boolean, false),
    case when p_props ->> 'device' in ('mobile', 'tablet', 'desktop') then p_props ->> 'device' end,
    case when upper(p_props ->> 'country') ~ '^[A-Z]{2}$' then upper(p_props ->> 'country') end,
    case when p_props ->> 'detail' ~ '^[a-z_]{1,40}$' then p_props ->> 'detail' end,
    case when p_props ->> 'in_app' in ('facebook', 'instagram', 'other') then p_props ->> 'in_app' end
  );
end;
$$;

create or replace function public.admin_engagement(p_days integer default 30, p_include text[] default '{}')
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
    with ev as (
      select name, coalesce(nullif(path, ''), '/') as path, detail
      from public.analytics_events
      where created_at >= v_since and name in ('visit', 'cta_click', 'scroll_depth', 'signup_started', 'consent', 'demo_progress')
    ),
    -- Same people as the dashboard's funnel: accounts created in the range, minus the excluded ones.
    cohort as (
      select u.id from auth.users u
      where u.created_at >= v_since
        and u.id not in (select user_id from public.admin_excluded_users(p_include))
    )
    select jsonb_build_object(
      'visits_by_page', coalesce((
        select jsonb_object_agg(path, n) from (select path, count(*) as n from ev where name = 'visit' group by path) v
      ), '{}'::jsonb),
      'clicks', coalesce((
        select jsonb_agg(jsonb_build_object('path', path, 'detail', detail, 'count', n) order by n desc, path, detail)
        from (select path, coalesce(detail, 'other') as detail, count(*) as n from ev where name = 'cta_click' group by 1, 2) c
      ), '[]'::jsonb),
      'scroll', coalesce((
        select jsonb_agg(jsonb_build_object('path', path, 'detail', detail, 'count', n) order by path, n desc)
        from (select path, detail, count(*) as n from ev where name = 'scroll_depth' and detail is not null group by 1, 2) s
      ), '[]'::jsonb),
      'signup_started', (select count(*) from ev where name = 'signup_started'),
      'consent_accepted', (select count(*) from ev where name = 'consent' and detail = 'accepted'),
      'consent_declined', (select count(*) from ev where name = 'consent' and detail = 'declined'),
      'demo_three_sets', (select count(*) from ev where name = 'demo_progress' and detail = 'three_sets'),
      'demo_finished', (select count(*) from ev where name = 'demo_progress' and detail = 'finished'),
      'started_workout', (select count(*) from cohort c where exists (select 1 from public.workout_sessions ws where ws.user_id = c.id)),
      'logged_a_set', (select count(*) from cohort c where exists (
        select 1 from public.session_sets ss where ss.user_id = c.id and ss.completed_at is not null
      ))
    )
  );
end;
$$;

revoke execute on function public.admin_engagement(integer, text[]) from public, anon;
grant execute on function public.admin_engagement(integer, text[]) to authenticated;
