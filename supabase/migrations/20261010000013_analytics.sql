-- First-party analytics and the admin dashboard.
--
-- Privacy by design:
-- - Visits are anonymous. No visitor id, no IP address and no user agent are stored: only the
--   page, the referring site, campaign tags from the link, device type and country.
-- - A new account's "first touch" (the campaign or site that brought them) is attached to the
--   account once, so the dashboard can show which campaigns bring people who stay.
-- - Training data never leaves this database. The dashboard shows totals only.
--
-- Additive: new tables and functions. Nothing existing changes.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (name in ('visit', 'signup_view')),
  path text check (path is null or char_length(path) <= 200),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 100),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 100),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 150),
  utm_content text check (utm_content is null or char_length(utm_content) <= 150),
  utm_term text check (utm_term is null or char_length(utm_term) <= 150),
  -- Whether the link came from a Facebook/Instagram ad (fbclid present). The click id itself
  -- is not stored.
  from_meta_ad boolean not null default false,
  device text check (device in ('mobile', 'tablet', 'desktop')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);

create index analytics_events_created_idx on public.analytics_events (created_at desc, name);

-- One row per account: where they first came from, recorded when they first sign in.
create table public.user_attribution (
  user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  landing_path text check (landing_path is null or char_length(landing_path) <= 200),
  utm_source text check (utm_source is null or char_length(utm_source) <= 100),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 100),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 150),
  utm_content text check (utm_content is null or char_length(utm_content) <= 150),
  utm_term text check (utm_term is null or char_length(utm_term) <= 150),
  from_meta_ad boolean not null default false,
  first_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Who can open the admin dashboard. Add yourself in the SQL Editor:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nobody reads or writes these tables directly; everything goes through the functions below.
alter table public.analytics_events enable row level security;
alter table public.user_attribution enable row level security;
alter table public.admins enable row level security;
revoke all on public.analytics_events, public.user_attribution, public.admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.clean_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]]', '', 'g')), p_max), '');
$$;

-- Records an anonymous event. Called by the app's /api/track route.
create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('visit', 'signup_view') then
    return;
  end if;
  insert into public.analytics_events (
    name, path, referrer_host, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    from_meta_ad, device, country
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
    case when upper(p_props ->> 'country') ~ '^[A-Z]{2}$' then upper(p_props ->> 'country') end
  );
end;
$$;

-- Attaches first-touch attribution to the caller's account. Only the first call counts, and
-- only for accounts created in the last 30 days (older accounts were not acquired by it).
create or replace function public.record_attribution(p_props jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seen timestamptz;
begin
  if v_user is null then
    return;
  end if;
  if not exists (select 1 from auth.users where id = v_user and created_at > now() - interval '30 days') then
    return;
  end if;
  begin
    v_seen := (p_props ->> 'first_seen_at')::timestamptz;
  exception when others then
    v_seen := null;
  end;
  insert into public.user_attribution (
    user_id, referrer_host, landing_path, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, from_meta_ad, first_seen_at
  ) values (
    v_user,
    lower(public.clean_text(p_props ->> 'referrer_host', 120)),
    public.clean_text(p_props ->> 'landing_path', 200),
    lower(public.clean_text(p_props ->> 'utm_source', 100)),
    lower(public.clean_text(p_props ->> 'utm_medium', 100)),
    public.clean_text(p_props ->> 'utm_campaign', 150),
    public.clean_text(p_props ->> 'utm_content', 150),
    public.clean_text(p_props ->> 'utm_term', 150),
    coalesce((p_props ->> 'from_meta_ad')::boolean, false),
    case when v_seen between now() - interval '60 days' and now() + interval '1 day' then v_seen end
  )
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- The label a visit or account is grouped under: campaign source, else referring site, else direct.
create or replace function public.source_label(p_utm_source text, p_referrer_host text, p_meta boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(p_utm_source, ''),
    case when p_meta then 'facebook' end,
    nullif(regexp_replace(coalesce(p_referrer_host, ''), '^(www\.|m\.|l\.|lm\.)', ''), ''),
    'direct'
  );
$$;

-- Everything the admin dashboard shows, for the last p_days days. Totals only.
create or replace function public.admin_overview(p_days integer default 30)
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
  new_users as (
    select u.id, u.created_at, u.email_confirmed_at,
      public.source_label(a.utm_source, a.referrer_host, coalesce(a.from_meta_ad, false)) as source,
      coalesce(a.utm_campaign, '') as campaign
    from auth.users u
    left join public.user_attribution a on a.user_id = u.id
    where u.created_at >= v_since
  ),
  first_workouts as (
    select ws.user_id, min(ws.completed_at) as first_at
    from public.workout_sessions ws
    where ws.status = 'completed' and ws.user_id in (select id from new_users)
    group by ws.user_id
  ),
  -- Came back: a completed workout 7 to 14 days after signing up (for accounts at least 14 days old).
  week2 as (
    select distinct ws.user_id
    from public.workout_sessions ws join new_users n on n.id = ws.user_id
    where ws.status = 'completed'
      and n.created_at < now() - interval '14 days'
      and ws.completed_at >= n.created_at + interval '7 days'
      and ws.completed_at < n.created_at + interval '14 days'
  ),
  visits as (
    select * from public.analytics_events where created_at >= v_since
  ),
  days as (
    select generate_series(v_since, date_trunc('day', now()), interval '1 day') as day
  )
  select jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'totals', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'visits', (select count(*) from visits where name = 'visit'),
      'signup_views', (select count(*) from visits where name = 'signup_view'),
      'signups', (select count(*) from new_users),
      'confirmed', (select count(*) from new_users where email_confirmed_at is not null),
      'first_workout', (select count(*) from first_workouts),
      'week2_eligible', (select count(*) from new_users where created_at < now() - interval '14 days'),
      'week2_returned', (select count(*) from week2),
      'workouts_logged', (select count(*) from public.workout_sessions where status = 'completed' and completed_at >= v_since),
      'active_users', (select count(distinct user_id) from public.workout_sessions where status = 'completed' and completed_at >= v_since)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'visits', (select count(*) from visits v where v.name = 'visit' and date_trunc('day', v.created_at) = d.day),
        'signups', (select count(*) from new_users n where date_trunc('day', n.created_at) = d.day),
        'workouts', (select count(*) from public.workout_sessions ws where ws.status = 'completed' and date_trunc('day', ws.completed_at) = d.day)
      ) order by d.day), '[]'::jsonb)
      from days d
    ),
    'sources', (
      select coalesce(jsonb_agg(row_to_json(s) order by s.signups desc, s.visits desc), '[]'::jsonb)
      from (
        select k.source, k.campaign,
          coalesce(v.visits, 0) as visits,
          coalesce(n.signups, 0) as signups,
          coalesce(n.first_workout, 0) as first_workout
        from (
          select public.source_label(utm_source, referrer_host, from_meta_ad) as source, coalesce(utm_campaign, '') as campaign
          from visits where name = 'visit'
          union
          select source, campaign from new_users
        ) k
        left join (
          select public.source_label(utm_source, referrer_host, from_meta_ad) as source, coalesce(utm_campaign, '') as campaign, count(*) as visits
          from visits where name = 'visit' group by 1, 2
        ) v using (source, campaign)
        left join (
          select n.source, n.campaign, count(*) as signups, count(f.user_id) as first_workout
          from new_users n left join first_workouts f on f.user_id = n.id
          group by 1, 2
        ) n using (source, campaign)
        order by coalesce(n.signups, 0) desc, coalesce(v.visits, 0) desc
        limit 50
      ) s
    ),
    'landing_pages', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'visits', c) order by c desc), '[]'::jsonb)
      from (select coalesce(path, '/') as path, count(*) as c from visits where name = 'visit' group by 1 order by 2 desc limit 10) p
    ),
    'devices', (
      select coalesce(jsonb_object_agg(coalesce(device, 'unknown'), c), '{}'::jsonb)
      from (select device, count(*) as c from visits where name = 'visit' group by 1) d
    ),
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('country', country, 'visits', c) order by c desc), '[]'::jsonb)
      from (select coalesce(country, '??') as country, count(*) as c from visits where name = 'visit' group by 1 order by 2 desc limit 10) c
    ),
    'features', jsonb_build_object(
      'active_split', (select count(*) from public.split_active_periods where ended_at is null),
      'targets_on', (select count(distinct user_id) from public.template_exercises where progression_enabled),
      'pounds', (select count(*) from public.profiles where weight_unit = 'lb'),
      'groups_created', (select count(*) from public.group_workouts where created_at >= v_since),
      'group_joins', (select count(*) from public.group_workout_members where role = 'member' and joined_at >= v_since),
      'group_sessions', (select count(*) from public.workout_sessions where group_workout_id is not null and status = 'completed' and completed_at >= v_since),
      'quick_workouts', (select count(*) from public.workout_sessions where template_id is null and group_workout_id is null and status = 'completed' and completed_at >= v_since),
      'feedback', (select count(*) from public.feedback where created_at >= v_since)
    ),
    'memberships', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      from (select status, count(*) as c from public.memberships group by 1) m
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function
  public.clean_text(text, integer),
  public.track_event(text, jsonb),
  public.record_attribution(jsonb),
  public.is_admin(),
  public.source_label(text, text, boolean),
  public.admin_overview(integer)
from public, anon, authenticated;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;
grant execute on function public.record_attribution(jsonb), public.is_admin(), public.admin_overview(integer) to authenticated;
