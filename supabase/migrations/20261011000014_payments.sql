-- Paid membership (Stripe), the free-trial gate and trial reminder emails.
--
-- - Payment status reaches the database only through billing_* functions that require the
--   app's billing secret (its SHA-256 hash is stored in app_settings). The app never holds a
--   master database key. Set it once in the SQL Editor (the same value as BILLING_SECRET in
--   Vercel; never commit or share it):
--     update public.app_settings
--     set billing_secret_hash = encode(extensions.digest('<your BILLING_SECRET>', 'sha256'), 'hex');
-- - Logging rule: founders, paying members and people within their trial can start workouts.
--   When a trial ends unpaid (or a subscription ends), history, progress and export stay
--   available; only starting new workouts is paused. A workout already in progress can be
--   finished.
-- - Free access for friends: the owner can give free access by email from the admin dashboard.
-- - Additive: new columns, two tables, new functions and one trigger; the sign-up membership
--   function also honours free-access invites. Existing memberships are
--   unchanged (everyone today is a founder).

alter table public.app_settings add column if not exists billing_secret_hash text;

alter table public.memberships
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan text check (plan is null or plan in ('monthly', 'yearly')),
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  -- A renewal payment failed; Stripe is retrying. Access continues meanwhile.
  add column if not exists billing_issue boolean not null default false,
  -- Stripe events can arrive out of order: older events never overwrite newer state.
  add column if not exists billing_updated_at timestamptz,
  add column if not exists trial_reminder_sent_at timestamptz;

-- Successful payments, for the admin dashboard. Kept (without the account link) if an
-- account is deleted, as the business's own payment record.
create table public.payments (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  stripe_invoice_id text not null unique,
  amount_pence integer not null check (amount_pence >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  plan text check (plan is null or plan in ('monthly', 'yearly')),
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index payments_paid_idx on public.payments (paid_at desc);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The logging gate
-- ---------------------------------------------------------------------------

create or replace function public.membership_allows_logging(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case m.status
      when 'founder' then true
      when 'paid' then true
      when 'trial' then m.trial_ends_at is null or m.trial_ends_at > now()
      else false
    end
    from public.memberships m where m.user_id = p_user
  ), true);  -- No membership row (should not happen): never lock anyone out.
$$;

create or replace function public.assert_can_start_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.membership_allows_logging(new.user_id) then
    raise exception 'membership_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger workout_sessions_membership before insert on public.workout_sessions
  for each row execute function public.assert_can_start_workout();

-- ---------------------------------------------------------------------------
-- Billing functions (server only, guarded by the billing secret)
-- ---------------------------------------------------------------------------

create or replace function public.assert_billing_secret(p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  select billing_secret_hash into v_hash from public.app_settings where id;
  if v_hash is null or p_secret is null or length(p_secret) < 32
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'billing_forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Remembers the Stripe customer created for an account at checkout.
create or replace function public.billing_link_customer(p_secret text, p_user uuid, p_customer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set stripe_customer_id = p_customer where user_id = p_user;
  if not found then
    insert into public.memberships (user_id, status, stripe_customer_id) values (p_user, 'lapsed', p_customer);
  end if;
end;
$$;

-- Applies a subscription's state from a Stripe event. Founders keep founder status.
create or replace function public.billing_apply_subscription(
  p_secret text,
  p_user uuid,
  p_customer text,
  p_subscription text,
  p_stripe_status text,
  p_plan text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
  v_status text;
begin
  perform public.assert_billing_secret(p_secret);
  select * into v_member from public.memberships
  where (p_user is not null and user_id = p_user) or (p_customer is not null and stripe_customer_id = p_customer)
  order by (user_id = p_user) desc nulls last
  limit 1
  for update;
  if not found then
    raise exception 'billing_user_not_found' using errcode = 'P0002';
  end if;
  if v_member.billing_updated_at is not null and p_event_at < v_member.billing_updated_at then
    return 'stale';
  end if;
  v_status := case
    when p_stripe_status in ('active', 'trialing', 'past_due') then 'paid'
    when p_stripe_status in ('canceled', 'unpaid', 'incomplete_expired') then 'lapsed'
    else null  -- 'incomplete' / 'paused': no change until Stripe settles it
  end;
  update public.memberships set
    status = case when status = 'founder' or v_status is null then status else v_status end,
    stripe_customer_id = coalesce(p_customer, stripe_customer_id),
    stripe_subscription_id = p_subscription,
    plan = case when p_plan in ('monthly', 'yearly') then p_plan else plan end,
    current_period_end = p_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
    billing_issue = p_stripe_status = 'past_due',
    billing_updated_at = p_event_at
  where user_id = v_member.user_id;
  return coalesce(v_status, 'unchanged');
end;
$$;

create or replace function public.billing_record_payment(
  p_secret text,
  p_customer text,
  p_invoice text,
  p_amount_pence integer,
  p_currency text,
  p_plan text,
  p_paid_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  insert into public.payments (user_id, stripe_invoice_id, amount_pence, currency, plan, paid_at)
  select m.user_id, p_invoice, p_amount_pence, lower(p_currency),
    case when p_plan in ('monthly', 'yearly') then p_plan else m.plan end,
    p_paid_at
  from (select 1) one
  left join public.memberships m on m.stripe_customer_id = p_customer
  on conflict (stripe_invoice_id) do nothing;
end;
$$;

-- Trials ending within 3 days that haven't had their reminder, with a few facts for the email.
create or replace function public.trial_reminders_due(p_secret text)
returns table (
  user_id uuid,
  email text,
  display_name text,
  trial_ends_at timestamptz,
  weight_unit text,
  workouts integer,
  working_sets integer,
  volume_kg numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select m.user_id, u.email::text, p.display_name, m.trial_ends_at, coalesce(p.weight_unit, 'kg'),
    (select count(*)::integer from public.workout_sessions ws where ws.user_id = m.user_id and ws.status = 'completed'),
    (select count(*)::integer from public.session_sets ss
      where ss.user_id = m.user_id and ss.completed_at is not null and ss.set_type = 'working'),
    (select coalesce(sum(ss.weight_kg * ss.reps), 0) from public.session_sets ss
      where ss.user_id = m.user_id and ss.completed_at is not null and ss.set_type = 'working')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.status = 'trial'
    and m.trial_ends_at > now() and m.trial_ends_at <= now() + interval '3 days'
    and m.trial_reminder_sent_at is null
    and u.email_confirmed_at is not null
  limit 200;
end;
$$;

create or replace function public.mark_trial_reminded(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set trial_reminder_sent_at = now() where user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin dashboard: adds a billing section (otherwise as in migration 13)
-- ---------------------------------------------------------------------------

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
    ),
    'billing', jsonb_build_object(
      'paying', (select count(*) from public.memberships where status = 'paid'),
      'monthly', (select count(*) from public.memberships where status = 'paid' and plan = 'monthly'),
      'yearly', (select count(*) from public.memberships where status = 'paid' and plan = 'yearly'),
      'canceling', (select count(*) from public.memberships where status = 'paid' and cancel_at_period_end),
      'billing_issue', (select count(*) from public.memberships where status = 'paid' and billing_issue),
      'revenue_pence', (select coalesce(sum(amount_pence), 0) from public.payments where currency = 'gbp' and paid_at >= v_since),
      -- Monthly recurring revenue from current paying members, at their latest payment.
      'mrr_pence', (
        select coalesce(round(sum(case when p.plan = 'yearly' then p.amount_pence / 12.0 else p.amount_pence end)), 0)
        from public.memberships m
        join lateral (
          select amount_pence, plan from public.payments
          where user_id = m.user_id and currency = 'gbp' order by paid_at desc limit 1
        ) p on true
        where m.status = 'paid'
      ),
      'trials_started', (select count(*) from public.memberships where trial_ends_at is not null and created_at >= v_since),
      'trials_active', (select count(*) from public.memberships where status = 'trial' and trial_ends_at > now()),
      'trials_converted', (select count(*) from public.memberships where trial_ends_at is not null and created_at >= v_since and status = 'paid'),
      'trials_ended_unpaid', (select count(*) from public.memberships where trial_ends_at is not null and created_at >= v_since
                               and ((status = 'trial' and trial_ends_at <= now()) or status = 'lapsed'))
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function
  public.membership_allows_logging(uuid),
  public.assert_can_start_workout(),
  public.assert_billing_secret(text),
  public.billing_link_customer(text, uuid, text),
  public.billing_apply_subscription(text, uuid, text, text, text, text, timestamptz, boolean, timestamptz),
  public.billing_record_payment(text, text, text, integer, text, text, timestamptz),
  public.trial_reminders_due(text),
  public.mark_trial_reminded(text, uuid)
from public, anon, authenticated;
-- Called by the app's server routes without a user session; each checks the billing secret.
grant execute on function
  public.billing_link_customer(text, uuid, text),
  public.billing_apply_subscription(text, uuid, text, text, text, text, timestamptz, boolean, timestamptz),
  public.billing_record_payment(text, text, text, integer, text, text, timestamptz),
  public.trial_reminders_due(text),
  public.mark_trial_reminded(text, uuid)
to anon, authenticated;
-- The app asks whether the signed-in user may start a workout (to show the upgrade screen).
create or replace function public.can_start_workout()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.membership_allows_logging(auth.uid());
$$;
revoke execute on function public.can_start_workout() from public, anon;
grant execute on function public.can_start_workout() to authenticated;

-- ---------------------------------------------------------------------------
-- Free access for friends (from the admin dashboard)
-- ---------------------------------------------------------------------------

-- Pending invitations: when someone signs up with this email address they get free access
-- (founder status) instead of a trial.
create table public.free_access_invites (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or char_length(note) <= 200),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.free_access_invites enable row level security;
revoke all on public.free_access_invites from anon, authenticated;

-- New accounts: a pending free-access invite wins; otherwise as before (founder while
-- auto_founder is on, else a trial).
create or replace function public.handle_new_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_invite public.free_access_invites;
begin
  select * into v_invite from public.free_access_invites
  where email = lower(btrim(new.email)) and accepted_at is null;
  if found then
    insert into public.memberships (user_id, status, note)
    values (new.id, 'founder', left(coalesce('Free access: ' || v_invite.note, 'Free access (invited)'), 200))
    on conflict (user_id) do nothing;
    update public.free_access_invites set accepted_at = now() where email = v_invite.email;
    return new;
  end if;
  select * into v_settings from public.app_settings where id;
  insert into public.memberships (user_id, status, trial_ends_at)
  values (
    new.id,
    case when coalesce(v_settings.auto_founder, true) then 'founder' else 'trial' end,
    case when coalesce(v_settings.auto_founder, true) then null
         else now() + make_interval(days => coalesce(v_settings.trial_days, 14)) end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Gives free access by email. Existing account: switched to free access now. Otherwise: a
-- pending invite (the app then emails them). Admins only.
create or replace function public.admin_grant_free_access(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
  v_user uuid;
  v_member public.memberships;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into public.free_access_invites (email, note, invited_by)
    values (v_email, v_note, auth.uid())
    on conflict (email) do update set note = excluded.note, invited_by = excluded.invited_by, accepted_at = null;
    return jsonb_build_object('result', 'invited', 'email', v_email);
  end if;
  select * into v_member from public.memberships where user_id = v_user;
  if v_member.status = 'founder' then
    return jsonb_build_object('result', 'already_free', 'email', v_email);
  end if;
  insert into public.memberships (user_id, status, note) values (v_user, 'founder', v_note)
  on conflict (user_id) do update set status = 'founder', trial_ends_at = null,
    note = coalesce(excluded.note, 'Free access (granted)');
  -- Someone paying keeps their Stripe subscription until it's cancelled in Stripe.
  return jsonb_build_object('result', 'granted', 'email', v_email, 'was_paying', coalesce(v_member.status = 'paid', false));
end;
$$;

create or replace function public.admin_revoke_invite(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from public.free_access_invites where email = lower(btrim(p_email)) and accepted_at is null;
end;
$$;

-- Who has free access and who is invited. Shows email addresses: admins only.
create or replace function public.admin_free_access_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('email', email, 'note', note, 'invited_at', created_at) order by created_at desc)
      from public.free_access_invites where accepted_at is null
    ), '[]'::jsonb),
    'free', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'note', m.note, 'since', u.created_at) order by u.created_at desc)
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.status = 'founder'
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_grant_free_access(text, text), public.admin_revoke_invite(text), public.admin_free_access_list() from public, anon;
grant execute on function public.admin_grant_free_access(text, text), public.admin_revoke_invite(text), public.admin_free_access_list() to authenticated;

-- Whether new sign-ups start a paid-plan trial (true) or get free early access (false). The
-- public landing page uses this so its pricing always matches what a new account gets.
create or replace function public.paid_plans_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select auto_founder from public.app_settings where id), true);
$$;
revoke execute on function public.paid_plans_live() from public;
grant execute on function public.paid_plans_live() to anon, authenticated;
