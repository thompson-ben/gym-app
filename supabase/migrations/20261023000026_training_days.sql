-- Training days, a reminder on those mornings, and a personal check-in after a week.
--
-- 1. profiles.training_days: the weekdays someone usually trains (1 = Monday … 7 = Sunday,
--    UK days). Null means not asked yet; an empty list means they chose not to say.
-- 2. training_day_reminders_due: on one of their days, people who haven't logged a first
--    workout get a short "your workout is ready" email, at most 4 times and never twice in a day.
-- 3. checkin_emails_due: 7–14 days after sign-up, still no workout: one plain email from the
--    founder asking what got in the way (replies go to the contact address).
-- 4. admin_training_days: who picked days, which days, and how many trained after each email.
--
-- All of it skips admins, test accounts, anyone who turned reminder emails off (migration 25)
-- and anyone whose trial has ended (they can't log a workout until they join).
-- Additive: new nullable columns and new functions.

alter table public.profiles add column if not exists training_days smallint[]
  check (training_days is null or (training_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(training_days) <= 7));

alter table public.memberships add column if not exists training_reminders_sent smallint not null default 0;
alter table public.memberships add column if not exists training_reminder_first_at timestamptz;
alter table public.memberships add column if not exists training_reminder_last_at timestamptz;
alter table public.memberships add column if not exists checkin_emailed_at timestamptz;

-- The first workout (with exercises) of someone's active split, with the split's name.
create or replace function public.waiting_workout(p_user uuid)
returns table (split_name text, workout_name text)
language sql
stable
set search_path = ''
as $$
  select s.name,
    (select wt.name from public.workout_templates wt
      where wt.split_id = s.id and exists (select 1 from public.template_exercises te where te.template_id = wt.id)
      order by wt.position, wt.created_at limit 1)
  from public.split_active_periods ap
  join public.splits s on s.id = ap.split_id
  where ap.user_id = p_user and ap.ended_at is null
  limit 1;
$$;

create or replace function public.training_day_reminders_due(p_secret text)
returns table (user_id uuid, email text, display_name text, training_days smallint[], split_name text, workout_name text, reminders_sent smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today smallint := extract(isodow from now() at time zone 'Europe/London')::smallint;
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select u.id, u.email::text, p.display_name, p.training_days, w.split_name, w.workout_name, m.training_reminders_sent
  from auth.users u
  join public.memberships m on m.user_id = u.id
  join public.profiles p on p.id = u.id
  left join lateral public.waiting_workout(u.id) w on true
  where v_today = any(p.training_days)
    and p.reminder_emails
    and u.email_confirmed_at is not null
    and u.created_at <= now() - interval '12 hours'
    and m.training_reminders_sent < 4
    and (m.training_reminder_last_at is null or m.training_reminder_last_at < now() - interval '20 hours')
    -- Not on the morning the one-off "first workout" email went out.
    and (m.first_workout_nudged_at is null or m.first_workout_nudged_at < now() - interval '20 hours')
    and public.membership_allows_logging(u.id)
    and u.id not in (select a.user_id from public.admins a)
    and u.id not in (select x.user_id from public.analytics_excluded_users x)
    and not public.has_trained(u.id)
  order by u.created_at
  limit 200;
end;
$$;

create or replace function public.mark_training_reminder_sent(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships
  set training_reminders_sent = training_reminders_sent + 1,
      training_reminder_first_at = coalesce(training_reminder_first_at, now()),
      training_reminder_last_at = now()
  where user_id = p_user;
end;
$$;

create or replace function public.checkin_emails_due(p_secret text)
returns table (user_id uuid, email text, display_name text, training_days smallint[], has_split boolean, split_name text, workout_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select u.id, u.email::text, p.display_name, p.training_days,
    exists (select 1 from public.splits s where s.user_id = u.id),
    w.split_name, w.workout_name
  from auth.users u
  join public.memberships m on m.user_id = u.id
  join public.profiles p on p.id = u.id
  left join lateral public.waiting_workout(u.id) w on true
  -- A full week, so people who train once or twice a week have had their chance.
  where u.created_at <= now() - interval '7 days'
    and u.created_at > now() - interval '14 days'
    and m.checkin_emailed_at is null
    and p.reminder_emails
    and u.email_confirmed_at is not null
    and public.membership_allows_logging(u.id)
    and u.id not in (select a.user_id from public.admins a)
    and u.id not in (select x.user_id from public.analytics_excluded_users x)
    and not public.has_trained(u.id)
  order by u.created_at
  limit 200;
end;
$$;

create or replace function public.mark_checkin_emailed(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set checkin_emailed_at = now() where user_id = p_user;
end;
$$;

-- Admin: training days people picked (customers, now) and how the two emails did in the range.
create or replace function public.admin_training_days(p_days integer default 30)
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
    with customers as (
      select p.id, p.training_days
      from public.profiles p
      where p.id not in (select a.user_id from public.admins a)
        and p.id not in (select x.user_id from public.analytics_excluded_users x)
    ),
    -- Whether someone finished a workout with a working set after a given time.
    trained_after as (
      select ws.user_id, min(ws.completed_at) as first_at
      from public.workout_sessions ws
      where ws.status = 'completed'
        and exists (
          select 1 from public.session_exercises se
          join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
          where se.session_id = ws.id and se.user_id = ws.user_id and ss.completed_at is not null and ss.set_type = 'working'
        )
      group by ws.user_id
    )
    select jsonb_build_object(
      'picked', (select count(*) from customers where cardinality(training_days) > 0),
      'skipped', (select count(*) from customers where training_days = '{}'),
      'by_day', (
        select jsonb_agg((select count(*) from customers c where d::smallint = any(c.training_days)) order by d)
        from generate_series(1, 7) d
      ),
      'reminded', (select count(*) from public.memberships m where m.training_reminder_first_at >= v_since),
      'reminded_trained', (
        select count(*) from public.memberships m join trained_after t on t.user_id = m.user_id
        where m.training_reminder_first_at >= v_since and t.first_at >= m.training_reminder_first_at
      ),
      'checkins', (select count(*) from public.memberships m where m.checkin_emailed_at >= v_since),
      'checkins_trained', (
        select count(*) from public.memberships m join trained_after t on t.user_id = m.user_id
        where m.checkin_emailed_at >= v_since and t.first_at >= m.checkin_emailed_at
      )
    )
  );
end;
$$;

revoke execute on function public.waiting_workout(uuid), public.training_day_reminders_due(text), public.mark_training_reminder_sent(text, uuid),
  public.checkin_emails_due(text), public.mark_checkin_emailed(text, uuid), public.admin_training_days(integer)
  from public, anon, authenticated;
grant execute on function public.admin_training_days(integer) to authenticated;
-- Called by the daily job without a user session; each checks the billing secret.
grant execute on function public.training_day_reminders_due(text), public.mark_training_reminder_sent(text, uuid),
  public.checkin_emails_due(text), public.mark_checkin_emailed(text, uuid) to anon, authenticated;
