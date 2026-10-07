-- Free access vs early access, and the launch switch.
--
-- Two kinds of member who don't pay today, both with status 'founder':
-- - Free access: people the owner deliberately gave free access to (and admins). They stay
--   free for good. Marked with memberships.free_access.
-- - Early access: everyone else who signed up before paid plans. At launch they start a
--   14-day trial and then follow the normal path.
--
-- admin_launch_paid_plans() does the launch in one step: new sign-ups start trials and every
-- early-access member starts a 14-day trial from that moment. History is never affected.
--
-- Additive: one column (with a backfill), new functions, and updated versions of the free
-- access functions from migration 14.

alter table public.memberships add column if not exists free_access boolean not null default false;

-- Backfill: grants made so far (the admin note, or the invite note "Free access…"), and admins.
-- Automatic early-access founders have no note; accounts from before memberships carry
-- 'Existing account when memberships were introduced'.
update public.memberships set free_access = true
where status = 'founder'
  and (
    (note is not null and note <> 'Existing account when memberships were introduced')
    or user_id in (select user_id from public.admins)
  );

-- Invited friends who sign up are free for good.
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
    insert into public.memberships (user_id, status, note, free_access)
    values (new.id, 'founder', left(coalesce('Free access: ' || v_invite.note, 'Free access (invited)'), 200), true)
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

-- Gives free access for good. Existing account (any status): free now. Otherwise an invite.
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
  if v_member.free_access then
    return jsonb_build_object('result', 'already_free', 'email', v_email);
  end if;
  insert into public.memberships (user_id, status, note, free_access) values (v_user, 'founder', coalesce(v_note, 'Free access (granted)'), true)
  on conflict (user_id) do update set status = 'founder', trial_ends_at = null, free_access = true,
    note = coalesce(v_note, public.memberships.note, 'Free access (granted)');
  -- Someone paying keeps their Stripe subscription until it's cancelled in Stripe.
  return jsonb_build_object('result', 'granted', 'email', v_email, 'was_paying', coalesce(v_member.status = 'paid', false));
end;
$$;

-- Takes free access away again. Before launch they become early access; after launch they
-- start a 14-day trial (never locked out on the spot).
create or replace function public.admin_remove_free_access(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    return;
  end if;
  update public.memberships set
    free_access = false,
    status = case when status = 'founder' and public.paid_plans_live() then 'trial' else status end,
    trial_ends_at = case when status = 'founder' and public.paid_plans_live()
                         then now() + make_interval(days => coalesce((select trial_days from public.app_settings where id), 14))
                         else trial_ends_at end,
    trial_reminder_sent_at = null
  where user_id = v_user and free_access;
end;
$$;

-- Free access (stays free), early access (trial at launch) and pending invites. Admins only.
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
    'live', public.paid_plans_live(),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('email', email, 'note', note, 'invited_at', created_at) order by created_at desc)
      from public.free_access_invites where accepted_at is null
    ), '[]'::jsonb),
    'free', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'note', m.note, 'since', u.created_at) order by u.created_at desc)
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.free_access
    ), '[]'::jsonb),
    'early', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'since', u.created_at) order by u.created_at desc)
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.status = 'founder' and not m.free_access
    ), '[]'::jsonb)
  );
end;
$$;

-- The launch: new sign-ups start trials, and every early-access member starts a 14-day trial
-- now. Free-access members are untouched. Returns who was moved, for the launch email.
-- Requires p_confirm = 'LAUNCH' so it can't run by accident.
create or replace function public.admin_launch_paid_plans(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_moved jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'LAUNCH' then
    raise exception 'launch_not_confirmed' using errcode = '22023';
  end if;
  select coalesce(trial_days, 14) into v_days from public.app_settings where id;
  update public.app_settings set auto_founder = false where id;

  with moved as (
    update public.memberships m set
      status = 'trial',
      trial_ends_at = now() + make_interval(days => v_days),
      trial_reminder_sent_at = null,
      note = coalesce(m.note, 'Early access: trial started at launch')
    where m.status = 'founder' and not m.free_access
    returning m.user_id, m.trial_ends_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', u.email, 'display_name', p.display_name, 'trial_ends_at', moved.trial_ends_at,
    'confirmed', u.email_confirmed_at is not null
  )), '[]'::jsonb)
  into v_moved
  from moved
  join auth.users u on u.id = moved.user_id
  left join public.profiles p on p.id = moved.user_id;

  return jsonb_build_object('trial_days', v_days, 'moved', v_moved);
end;
$$;

revoke execute on function public.admin_remove_free_access(text), public.admin_launch_paid_plans(text) from public, anon;
grant execute on function public.admin_remove_free_access(text), public.admin_launch_paid_plans(text) to authenticated;
