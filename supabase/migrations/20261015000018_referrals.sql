-- Referrals: invite a training partner, get 14 more days of free trial (once per account).
--
-- Who referred whom is recorded when a new account arrives through someone's link:
--   - their personal invite link (notchlift.com/?ref=CODE), via first-touch attribution;
--   - a group workout invite they join (the host referred them);
--   - a shared split they copy (the sharer referred them).
-- The referrer is rewarded when the friend finishes their first workout with a confirmed
-- working set (not just on sign-up, so a second email address isn't enough). The reward:
-- 14 more trial days, once per account, for someone on a trial whose friend signed up while
-- that trial was running. If the trial has ended by then, it restarts for 14 days from now.
-- Paying members and free accounts are recorded but not rewarded.
--
-- Additive: new tables, two columns on memberships, triggers and functions. History, sessions
-- and existing memberships are unchanged.

create table public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.referrals (
  referred_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  via text not null check (via in ('link', 'group', 'split')),
  created_at timestamptz not null default now(),
  -- The friend's first finished workout with a confirmed working set.
  qualified_at timestamptz,
  -- This referral earned the referrer their reward.
  rewarded_at timestamptz,
  check (referred_id <> referrer_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);
-- One reward per referrer, ever.
create unique index referrals_one_reward on public.referrals (referrer_id) where rewarded_at is not null;

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on public.referral_codes, public.referrals from anon, authenticated;

alter table public.memberships
  add column if not exists referral_reward_at timestamptz,
  add column if not exists referral_notified_at timestamptz;

-- The caller's invite code, created on first use.
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select code into v_code from public.referral_codes where user_id = v_user;
  while v_code is null loop
    select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % 32), 1), '' order by i)
      into v_code
      from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
    begin
      insert into public.referral_codes (user_id, code) values (v_user, v_code);
    exception when unique_violation then
      -- Another tab made one first, or (rarely) the code is taken: use or retry.
      select code into v_code from public.referral_codes where user_id = v_user;
    end;
  end loop;
  return v_code;
end;
$$;

-- An email address without its +tag (and, for Gmail, without dots): to spot self-referrals.
create or replace function public.email_identity(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(lower(p_email), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(p_email), '@', 1), '+', 1) || '@' || split_part(lower(p_email), '@', 2)
  end;
$$;

-- Records that p_referrer brought p_referred, if p_referred is a new account (14 days or less),
-- joined after the referrer, isn't the referrer under another address, and has no referrer yet.
create or replace function public.link_referral(p_referred uuid, p_referrer uuid, p_via text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referred auth.users;
  v_referrer auth.users;
begin
  if p_referred is null or p_referrer is null or p_referred = p_referrer then
    return;
  end if;
  select * into v_referred from auth.users where id = p_referred;
  select * into v_referrer from auth.users where id = p_referrer;
  if v_referred.id is null or v_referrer.id is null
     or v_referred.created_at < now() - interval '14 days'
     or v_referred.created_at < v_referrer.created_at
     or public.email_identity(v_referred.email) = public.email_identity(v_referrer.email) then
    return;
  end if;
  insert into public.referrals (referred_id, referrer_id, via) values (p_referred, p_referrer, p_via)
  on conflict (referred_id) do nothing;
end;
$$;

-- First-touch attribution (migration 13), now also reading an invite code (props.ref).
create or replace function public.record_attribution(p_props jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seen timestamptz;
  v_referrer uuid;
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

  select user_id into v_referrer from public.referral_codes where code = upper(btrim(coalesce(p_props ->> 'ref', '')));
  if v_referrer is not null then
    perform public.link_referral(v_user, v_referrer, 'link');
  end if;
end;
$$;

-- Joining someone's group workout: the host referred a new account.
create or replace function public.referral_from_group_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'member' then
    begin
      perform public.link_referral(new.user_id, (select user_id from public.group_workouts where id = new.group_workout_id), 'group');
    exception when others then
      null;  -- never block joining or copying
    end;
  end if;
  return new;
end;
$$;
create trigger group_workout_members_referral after insert on public.group_workout_members
  for each row execute function public.referral_from_group_join();

-- Copying a shared split: the sharer referred a new account.
create or replace function public.referral_from_split_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.copied_from_share_id is not null then
    begin
      perform public.link_referral(new.user_id, (select user_id from public.split_shares where id = new.copied_from_share_id), 'split');
    exception when others then
      null;  -- never block joining or copying
    end;
  end if;
  return new;
end;
$$;
create trigger splits_referral after insert on public.splits
  for each row execute function public.referral_from_split_copy();

-- When a referred friend finishes their first real workout: qualify the referral and, if the
-- referrer is eligible, extend their trial by 14 days.
create or replace function public.referral_on_workout_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  -- Never let referral bookkeeping stop a workout from being saved.
  begin
    perform public.referral_qualify(new.id, new.user_id);
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function public.referral_qualify(p_session uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref public.referrals;
  v_member public.memberships;
  v_original_end timestamptz;
begin
  select * into v_ref from public.referrals where referred_id = p_user and qualified_at is null;
  if v_ref.referred_id is null then
    return;
  end if;
  -- A confirmed working set, and a confirmed email address.
  if not exists (
    select 1 from public.session_exercises se
    join public.session_sets ss on ss.session_exercise_id = se.id and ss.user_id = se.user_id
    where se.session_id = p_session and se.user_id = p_user and ss.completed_at is not null and ss.set_type = 'working'
  ) or not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
    return;
  end if;
  update public.referrals set qualified_at = now() where referred_id = p_user;

  select * into v_member from public.memberships where user_id = v_ref.referrer_id for update;
  if v_member.user_id is null or v_member.status <> 'trial' or v_member.trial_ends_at is null
     or v_member.referral_reward_at is not null then
    return;
  end if;
  v_original_end := v_member.trial_ends_at;
  -- The friend must have signed up while the referrer's trial was running.
  if v_ref.created_at > v_original_end then
    return;
  end if;
  update public.memberships set
    trial_ends_at = greatest(v_original_end, now()) + interval '14 days',
    referral_reward_at = now(),
    referral_notified_at = null,
    trial_reminder_sent_at = null
  where user_id = v_ref.referrer_id;
  update public.referrals set rewarded_at = now() where referred_id = p_user;
end;
$$;
create trigger workout_sessions_referral after update of status on public.workout_sessions
  for each row execute function public.referral_on_workout_finished();

-- The caller's referral status, for Profile.
create or replace function public.my_referral_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', (select code from public.referral_codes where user_id = auth.uid()),
    'invited', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'training', (select count(*) from public.referrals where referrer_id = auth.uid() and qualified_at is not null),
    'rewarded_at', (select referral_reward_at from public.memberships where user_id = auth.uid())
  );
$$;

-- Server only (the daily job): referrers to email about their reward, and marking them done.
create or replace function public.referral_rewards_to_notify(p_secret text)
returns table (user_id uuid, email text, display_name text, trial_ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
    select m.user_id, u.email::text, p.display_name, m.trial_ends_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.referral_reward_at is not null and m.referral_notified_at is null
      and u.email_confirmed_at is not null;
end;
$$;

create or replace function public.mark_referral_notified(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set referral_notified_at = now() where user_id = p_user;
end;
$$;

-- Admin dashboard: referral totals for accounts created in the range.
create or replace function public.admin_referrals(p_days integer default 30)
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
  return jsonb_build_object(
    'sharers', (select count(*) from public.referral_codes),
    'referred', (select count(*) from public.referrals where created_at >= v_since),
    'by_link', (select count(*) from public.referrals where created_at >= v_since and via = 'link'),
    'by_group', (select count(*) from public.referrals where created_at >= v_since and via = 'group'),
    'by_split', (select count(*) from public.referrals where created_at >= v_since and via = 'split'),
    'qualified', (select count(*) from public.referrals where created_at >= v_since and qualified_at is not null),
    'rewards', (select count(*) from public.referrals where rewarded_at >= v_since),
    'referred_paid', (
      select count(*) from public.referrals r
      where r.created_at >= v_since
        and (exists (select 1 from public.payments p where p.user_id = r.referred_id)
             or exists (select 1 from public.memberships m where m.user_id = r.referred_id and m.status = 'paid'))
    )
  );
end;
$$;

revoke execute on function
  public.my_referral_code(), public.email_identity(text), public.link_referral(uuid, uuid, text),
  public.referral_from_group_join(), public.referral_from_split_copy(), public.referral_on_workout_finished(),
  public.referral_qualify(uuid, uuid),
  public.my_referral_status(), public.referral_rewards_to_notify(text), public.mark_referral_notified(text, uuid),
  public.admin_referrals(integer)
from public, anon, authenticated;
grant execute on function public.my_referral_code(), public.my_referral_status(), public.admin_referrals(integer) to authenticated;
-- Called by the daily job without a user session; each checks the billing secret.
grant execute on function public.referral_rewards_to_notify(text), public.mark_referral_notified(text, uuid) to anon, authenticated;
