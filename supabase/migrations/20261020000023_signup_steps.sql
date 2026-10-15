-- Where people drop out of sign-up, and Apple / Google sign-in.
--
-- 1. Three more anonymous events, with the same privacy rules as visits (migration 13):
--    signup_submit (tapped Create account), signup_error (why it didn't go through: a short
--    reason code, never what was typed) and oauth_start (tapped Continue with Apple / Google).
--    Every event also notes whether the page was open inside the Facebook or Instagram app,
--    worked out from the browser name and not stored with anything else about the browser.
-- 2. admin_signup_steps: those counts for the dashboard, plus how new accounts signed up
--    (email, Apple or Google).
-- 3. New accounts from Apple or Google start with the name the provider shares, if any.
--
-- Additive: two nullable columns, a wider event-name check and new or replaced functions.

alter table public.analytics_events add column if not exists detail text
  check (detail is null or detail ~ '^[a-z_]{1,40}$');
alter table public.analytics_events add column if not exists in_app text
  check (in_app is null or in_app in ('facebook', 'instagram', 'other'));

alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events
  add constraint analytics_events_name_check
  check (name in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start'));

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('visit', 'signup_view', 'pricing_view', 'signup_submit', 'signup_error', 'oauth_start') then
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

-- The sign-up steps in the dashboard's range (UTC days, like the rest of the overview).
create or replace function public.admin_signup_steps(p_days integer default 30)
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
      select name, detail, in_app from public.analytics_events where created_at >= v_since
    ),
    new_users as (
      select coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
      from auth.users u
      where u.created_at >= v_since
        and u.id not in (select a.user_id from public.admins a)
        and u.id not in (select x.user_id from public.analytics_excluded_users x)
    )
    select jsonb_build_object(
      'views', (select count(*) from ev where name = 'signup_view'),
      'views_in_app', (select count(*) from ev where name = 'signup_view' and in_app is not null),
      'submits', (select count(*) from ev where name = 'signup_submit'),
      'oauth_apple', (select count(*) from ev where name = 'oauth_start' and detail = 'apple'),
      'oauth_google', (select count(*) from ev where name = 'oauth_start' and detail = 'google'),
      'errors', coalesce((
        select jsonb_agg(jsonb_build_object('reason', r.detail, 'count', r.n) order by r.n desc, r.detail)
        from (select coalesce(detail, 'other') as detail, count(*) as n from ev where name = 'signup_error' group by 1) r
      ), '[]'::jsonb),
      'methods', jsonb_build_object(
        'email', (select count(*) from new_users where provider = 'email'),
        'apple', (select count(*) from new_users where provider = 'apple'),
        'google', (select count(*) from new_users where provider = 'google')
      )
    )
  );
end;
$$;

revoke execute on function public.admin_signup_steps(integer) from public, anon;
grant execute on function public.admin_signup_steps(integer) to authenticated;

-- Profiles start with the name Apple or Google shares (people can change it in Profile).
-- Email sign-ups carry no name, so nothing changes for them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 60);
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(v_name, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
