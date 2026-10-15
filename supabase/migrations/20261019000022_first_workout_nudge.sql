-- One "start your first workout" email, the morning after sign-up.
--
-- Sent by the daily 9am job to people who signed up 18–72 hours ago, have confirmed their
-- email and haven't finished a workout with a confirmed working set. Once per account.
-- The email says what to do next: pick a split, or start the workout that's waiting.
--
-- Additive: one column on memberships and new functions.

alter table public.memberships add column if not exists first_workout_nudged_at timestamptz;

-- Whether someone has finished a workout with at least one confirmed working set.
create or replace function public.has_trained(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions ws
    join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
    join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
    where ws.user_id = p_user and ws.status = 'completed' and ss.completed_at is not null and ss.set_type = 'working'
  );
$$;

create or replace function public.first_workout_nudges_due(p_secret text)
returns table (user_id uuid, email text, display_name text, trial_ends_at timestamptz, split_name text, workout_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select u.id, u.email::text, p.display_name,
    case when m.status = 'trial' then m.trial_ends_at end,
    s.name,
    -- The first workout (with exercises) of their active split.
    (select wt.name from public.workout_templates wt
      where wt.split_id = s.id and exists (select 1 from public.template_exercises te where te.template_id = wt.id)
      order by wt.position, wt.created_at limit 1)
  from auth.users u
  join public.memberships m on m.user_id = u.id
  left join public.profiles p on p.id = u.id
  left join public.split_active_periods ap on ap.user_id = u.id and ap.ended_at is null
  left join public.splits s on s.id = ap.split_id
  where u.created_at <= now() - interval '18 hours'
    and u.created_at > now() - interval '72 hours'
    and u.email_confirmed_at is not null
    and m.first_workout_nudged_at is null
    and u.id not in (select a.user_id from public.admins a)
    and u.id not in (select x.user_id from public.analytics_excluded_users x)
    and not public.has_trained(u.id)
  -- Oldest first, so nobody ages out of the window while waiting.
  order by u.created_at
  limit 200;
end;
$$;

create or replace function public.mark_first_workout_nudged(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set first_workout_nudged_at = now() where user_id = p_user;
end;
$$;

-- Admin: of the people nudged in the range, how many trained within 3 days of the email.
create or replace function public.admin_nudges(p_days integer default 30)
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
    select jsonb_build_object(
      'nudged', count(*),
      'trained_3d', count(*) filter (where exists (
        select 1
        from public.workout_sessions ws
        join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where ws.user_id = m.user_id and ws.status = 'completed' and ss.completed_at is not null and ss.set_type = 'working'
          and ws.completed_at >= m.first_workout_nudged_at and ws.completed_at < m.first_workout_nudged_at + interval '3 days'
      )),
      -- Nudged at least 3 days ago, so the result is final.
      'settled', count(*) filter (where m.first_workout_nudged_at <= now() - interval '3 days')
    )
    from public.memberships m
    where m.first_workout_nudged_at >= v_since
  );
end;
$$;

revoke execute on function public.has_trained(uuid), public.first_workout_nudges_due(text), public.mark_first_workout_nudged(text, uuid), public.admin_nudges(integer)
  from public, anon, authenticated;
grant execute on function public.admin_nudges(integer) to authenticated;
-- Called by the daily job without a user session; each checks the billing secret.
grant execute on function public.first_workout_nudges_due(text), public.mark_first_workout_nudged(text, uuid) to anon, authenticated;
