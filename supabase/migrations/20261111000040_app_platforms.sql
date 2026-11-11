-- Where people sign up and train: the iPhone app or the website.
--
-- The app records, once per account, whether it was created in the iPhone app or on the web
-- (note_platform within a day of sign-up), and when someone uses the iPhone app (first and last
-- day). The admin dashboard shows it next to the App Store link taps on the website
-- (cta_click events ending in "app_store"), so the path landing page → App Store → app can be
-- followed in aggregate. Nothing here links a website visit to a person.
--
-- Additive: one table and two functions.

create table if not exists public.user_platforms (
  user_id uuid primary key references auth.users (id) on delete cascade,
  signup_platform text check (signup_platform in ('ios_app', 'web')),
  first_app_at timestamptz,
  last_app_at timestamptz
);

alter table public.user_platforms enable row level security;
revoke all on public.user_platforms from anon, authenticated;

-- Called by the signed-in member's app or browser (at most once a day). The sign-up platform comes
-- from the sign-up form when it set one (email sign-ups), otherwise from where a new account (less
-- than a day old) is first used, so older accounts aren't mislabelled.
create or replace function public.note_platform(p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_new boolean;
  -- Set by the sign-up form for email sign-ups, which may be confirmed in another browser.
  v_meta text;
begin
  if v_user is null or p_platform not in ('ios_app', 'web') then
    return;
  end if;
  select u.created_at > now() - interval '1 day', u.raw_user_meta_data ->> 'signup_platform'
    into v_new, v_meta from auth.users u where u.id = v_user;
  insert into public.user_platforms (user_id, signup_platform, first_app_at, last_app_at)
  values (
    v_user,
    case when v_meta in ('ios_app', 'web') then v_meta when v_new then p_platform end,
    case when p_platform = 'ios_app' then now() end,
    case when p_platform = 'ios_app' then now() end
  )
  on conflict (user_id) do update set
    signup_platform = coalesce(public.user_platforms.signup_platform, excluded.signup_platform),
    first_app_at = coalesce(public.user_platforms.first_app_at, excluded.first_app_at),
    last_app_at = coalesce(excluded.last_app_at, public.user_platforms.last_app_at);
end;
$$;

-- Admin: App Store link taps on the website, sign-ups by platform and iPhone app use, for the range.
create or replace function public.admin_app_funnel(p_days integer default 30, p_include text[] default '{}')
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
    with taps as (
      select detail from public.analytics_events
      where created_at >= v_since and name = 'cta_click' and detail like '%app_store%'
    ),
    cohort as (
      select u.id from auth.users u
      where u.created_at >= v_since and u.id not in (select user_id from public.admin_excluded_users(p_include))
    ),
    people as (
      select p.* from public.user_platforms p
      where p.user_id not in (select user_id from public.admin_excluded_users(p_include))
    )
    select jsonb_build_object(
      'app_store_taps', (select count(*) from taps),
      'taps_landing', (select count(*) from taps where detail like 'hero_app_store%'),
      'taps_ad_page', (select count(*) from taps where detail = 'ad_app_store'),
      'taps_signed_in', (select count(*) from taps where detail = 'install_app_store'),
      'signups_app', (select count(*) from cohort c join people p on p.user_id = c.id where p.signup_platform = 'ios_app'),
      'signups_web', (select count(*) from cohort c join people p on p.user_id = c.id where p.signup_platform = 'web'),
      'app_users', (select count(*) from people where last_app_at >= v_since),
      'app_new_users', (select count(*) from people where first_app_at >= v_since)
    )
  );
end;
$$;

revoke execute on function public.note_platform(text), public.admin_app_funnel(integer, text[]) from public, anon;
grant execute on function public.note_platform(text), public.admin_app_funnel(integer, text[]) to authenticated;
