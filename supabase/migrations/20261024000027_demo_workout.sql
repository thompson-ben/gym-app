-- "Try a workout" demo: three more anonymous events and an admin summary.
--
-- demo_start (opened the demo workout), demo_set (ticked a first set) and demo_signup (tapped
-- create account from it) follow the same privacy rules as visits (migration 13): no account,
-- no details of what was typed. Accounts that came from the demo carry via = 'demo' in their
-- sign-up details, so admin_demo can say how many signed up and trained.
--
-- Additive: a wider event-name check, a replaced track_event and one new function.

alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events
  add constraint analytics_events_name_check
  check (name in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start', 'demo_start', 'demo_set', 'demo_signup'));

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start', 'demo_start', 'demo_set', 'demo_signup') then
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

create or replace function public.admin_demo(p_days integer default 30)
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
      select name from public.analytics_events where created_at >= v_since and name in ('demo_start', 'demo_set', 'demo_signup')
    ),
    accounts as (
      select u.id
      from auth.users u
      where u.created_at >= v_since
        and u.raw_user_meta_data ->> 'via' = 'demo'
        and u.id not in (select a.user_id from public.admins a)
        and u.id not in (select x.user_id from public.analytics_excluded_users x)
    )
    select jsonb_build_object(
      'started', (select count(*) from ev where name = 'demo_start'),
      'logged_set', (select count(*) from ev where name = 'demo_set'),
      'tapped_signup', (select count(*) from ev where name = 'demo_signup'),
      'accounts', (select count(*) from accounts),
      'trained', (select count(*) from accounts a where public.has_trained(a.id))
    )
  );
end;
$$;

revoke execute on function public.admin_demo(integer) from public, anon;
grant execute on function public.admin_demo(integer) to authenticated;
