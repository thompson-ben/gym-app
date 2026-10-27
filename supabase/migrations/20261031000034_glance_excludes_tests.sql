-- The admin dashboard's "Yesterday" card left admins and test accounts out of sign-ups and
-- first workouts only, so a test account's payment, cancellation, trial or comment still showed
-- there. Now every figure on the card leaves out admins and test accounts (free-access friends
-- still count, as before).
--
-- Replaces admin_glance(); same signature and result shape.

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
  return (
  with excluded as (select user_id from public.admin_excluded_users(array['friends']))
  select jsonb_build_object(
    'yesterday', v_today - 1,
    'visits', (select count(*) from public.analytics_events where name = 'visit' and created_at >= v_y_start and created_at < v_y_end),
    'signups', (
      select count(*) from auth.users u
      where u.created_at >= v_y_start and u.created_at < v_y_end
        and u.id not in (select user_id from excluded)
    ),
    -- People whose first finished workout (with a confirmed working set) was yesterday.
    'first_workouts', (
      select count(*) from (
        select ws.user_id, min(ws.completed_at) as first_at
        from public.workout_sessions ws
        join public.session_exercises se on se.session_id = ws.id and se.user_id = ws.user_id
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where ws.status = 'completed' and ss.completed_at is not null and ss.set_type = 'working'
          and ws.user_id not in (select user_id from excluded)
        group by ws.user_id
      ) f where f.first_at >= v_y_start and f.first_at < v_y_end
    ),
    'payments', (select count(*) from public.payments where paid_at >= v_y_start and paid_at < v_y_end and (user_id is null or user_id not in (select user_id from excluded))),
    'revenue_pence', (select coalesce(sum(amount_pence), 0) from public.payments where paid_at >= v_y_start and paid_at < v_y_end and (user_id is null or user_id not in (select user_id from excluded))),
    'trials_ending_3d', (
      select count(*) from public.memberships
      where status = 'trial' and trial_ends_at > now() and trial_ends_at <= now() + interval '3 days'
        and user_id not in (select user_id from excluded)
    ),
    'cancelling', (select count(*) from public.memberships where status = 'paid' and cancel_at_period_end and user_id not in (select user_id from excluded)),
    'billing_issues', (select count(*) from public.memberships where status = 'paid' and billing_issue and user_id not in (select user_id from excluded)),
    'new_comments', (
      (select count(*) from public.survey_answers where detail is not null and created_at > now() - interval '24 hours' and user_id not in (select user_id from excluded))
      + (select count(*) from public.feedback where created_at > now() - interval '24 hours' and user_id not in (select user_id from excluded))
    )
  )
  );
end;
$$;
