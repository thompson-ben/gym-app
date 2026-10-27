-- 7 more days for trials about to end without a single workout.
--
-- The daily 9am job calls extend_untrained_trials() before the trial reminders. It finds trials
-- that end within 3 days (or ended in the last day, so a trial that ran out overnight is still
-- caught) where the person has confirmed their email and hasn't finished a workout with a
-- confirmed working set. Each gets 7 days added, once per account, and the job emails a short
-- note from the founder. The trial reminder is reset so the usual "your trial ends" email comes
-- again before the new end. Admins and test accounts are left out, as with the other nudges.
--
-- Additive: one column on memberships and one function.

alter table public.memberships add column if not exists trial_extended_at timestamptz;

create or replace function public.extend_untrained_trials(p_secret text)
returns table (user_id uuid, email text, display_name text, trial_ends_at timestamptz, split_name text, workout_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  with due as (
    select m.user_id
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.status = 'trial'
      and m.trial_ends_at > now() - interval '1 day'
      and m.trial_ends_at <= now() + interval '3 days'
      and m.trial_extended_at is null
      and u.email_confirmed_at is not null
      and m.user_id not in (select a.user_id from public.admins a)
      and m.user_id not in (select x.user_id from public.analytics_excluded_users x)
      and not public.has_trained(m.user_id)
    order by m.trial_ends_at
    limit 200
    for update of m skip locked
  ),
  extended as (
    update public.memberships m set
      trial_ends_at = greatest(m.trial_ends_at, now()) + interval '7 days',
      trial_extended_at = now(),
      trial_reminder_sent_at = null
    from due
    where m.user_id = due.user_id
    returning m.user_id, m.trial_ends_at
  )
  select u.id, u.email::text, p.display_name, e.trial_ends_at, s.name,
    -- The first workout (with exercises) of their active split.
    (select wt.name from public.workout_templates wt
      where wt.split_id = s.id and exists (select 1 from public.template_exercises te where te.template_id = wt.id)
      order by wt.position, wt.created_at limit 1)
  from extended e
  join auth.users u on u.id = e.user_id
  left join public.profiles p on p.id = u.id
  left join public.split_active_periods ap on ap.user_id = u.id and ap.ended_at is null
  left join public.splits s on s.id = ap.split_id;
end;
$$;

revoke execute on function public.extend_untrained_trials(text) from public, anon, authenticated;
-- Called by the daily job's server route without a user session; it checks the billing secret.
grant execute on function public.extend_untrained_trials(text) to anon, authenticated;
