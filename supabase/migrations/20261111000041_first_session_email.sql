-- One "nice first session" email, the morning after someone's first workout.
--
-- Sent by the daily 9am job to people whose first finished workout with a confirmed working set
-- was 8–72 hours ago (so a workout late last night still counts, and nobody hears about one from
-- last week). It shows what they did and the best set of each exercise, to beat next time.
-- Once per account. Imported history is older than the window, so it never triggers this.
--
-- Additive: one column on memberships and two functions.

alter table public.memberships add column if not exists first_session_emailed_at timestamptz;

create or replace function public.first_session_emails_due(p_secret text)
returns table (
  user_id uuid, email text, display_name text, weight_unit text, trial_ends_at timestamptz,
  workout_name text, working_sets integer, exercises jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  with firsts as (
    -- Each person's first finished workout with a confirmed working set.
    select distinct on (ws.user_id) ws.user_id, ws.id as session_id, ws.template_name, ws.completed_at
    from public.workout_sessions ws
    where ws.status = 'completed'
      and exists (
        select 1 from public.session_exercises se
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where se.session_id = ws.id and se.user_id = ws.user_id and ss.completed_at is not null and ss.set_type = 'working'
      )
    order by ws.user_id, ws.completed_at
  )
  select u.id, u.email::text, p.display_name, coalesce(p.weight_unit, 'kg'),
    case when m.status = 'trial' then m.trial_ends_at end,
    f.template_name,
    (select count(*)::integer
      from public.session_exercises se
      join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
      where se.session_id = f.session_id and se.user_id = f.user_id and ss.completed_at is not null and ss.set_type = 'working'),
    -- The best working set of each exercise (heaviest, then most reps), in workout order, up to 6.
    coalesce((
      select jsonb_agg(jsonb_build_object('name', b.exercise_name, 'mode', b.tracking_mode, 'weight_kg', b.weight_kg, 'reps', b.reps) order by b.position)
      from (
        select distinct on (se.id) se.id, se.position, se.exercise_name, e.tracking_mode, ss.weight_kg, ss.reps
        from public.session_exercises se
        join public.exercises e on e.id = se.exercise_id
        join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
        where se.session_id = f.session_id and se.user_id = f.user_id and ss.completed_at is not null and ss.set_type = 'working'
        order by se.id, coalesce(ss.weight_kg, 0) desc, ss.reps desc
      ) b
      where b.position in (
        select x.position from public.session_exercises x
        where x.session_id = f.session_id and x.user_id = f.user_id
          and exists (select 1 from public.session_sets y where y.session_exercise_id = x.id and y.user_id = x.user_id and y.completed_at is not null and y.set_type = 'working')
        order by x.position limit 6
      )
    ), '[]'::jsonb)
  from firsts f
  join auth.users u on u.id = f.user_id
  join public.memberships m on m.user_id = u.id
  left join public.profiles p on p.id = u.id
  where f.completed_at <= now() - interval '8 hours'
    and f.completed_at > now() - interval '72 hours'
    and u.email is not null
    and u.email_confirmed_at is not null
    and m.first_session_emailed_at is null
    and u.id not in (select a.user_id from public.admins a)
    and u.id not in (select x.user_id from public.analytics_excluded_users x)
  -- Oldest first, so nobody ages out of the window while waiting.
  order by f.completed_at
  limit 200;
end;
$$;

create or replace function public.mark_first_session_emailed(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set first_session_emailed_at = now() where user_id = p_user;
end;
$$;

revoke execute on function public.first_session_emails_due(text), public.mark_first_session_emailed(text, uuid) from public, anon, authenticated;
grant execute on function public.first_session_emails_due(text), public.mark_first_session_emailed(text, uuid) to anon, authenticated;
