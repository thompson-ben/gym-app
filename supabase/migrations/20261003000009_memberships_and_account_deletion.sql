-- Memberships (founder / trial / paid / lapsed) and self-service account deletion.
--
-- Additive: one new table, one settings table, two functions and a sign-up trigger. No
-- existing rows are changed apart from the backfill below, which creates a membership row
-- for every existing account.
--
-- Membership is managed by the app owner, never by users: users can read their own row but
-- have no insert/update/delete rights on it. Tag someone as a founder in the SQL Editor:
--
--   update public.memberships set status = 'founder'
--   where user_id = (select id from auth.users where email = 'friend@example.com');
--
-- While public.app_settings.auto_founder is true (the default for the founding-members
-- phase), every new sign-up becomes a founder automatically. Before paid plans launch:
--
--   update public.app_settings set auto_founder = false;   -- new sign-ups start a trial

create table public.app_settings (
  id boolean primary key default true check (id),
  auto_founder boolean not null default true,
  trial_days integer not null default 14 check (trial_days between 0 and 90)
);
insert into public.app_settings default values on conflict do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

create table public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('founder', 'trial', 'paid', 'lapsed')),
  -- Only meaningful for 'trial'. Founders never expire.
  trial_ends_at timestamptz,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

alter table public.memberships enable row level security;
create policy "memberships: read own" on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
-- No write policies, and no write grants: only the owner (SQL Editor / service role) can tag.
revoke insert, update, delete, truncate on public.memberships from anon, authenticated;
revoke all on public.memberships from anon;

create or replace function public.handle_new_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
begin
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

create trigger on_auth_user_created_membership after insert on auth.users
  for each row execute function public.handle_new_membership();

-- Everyone who already has an account is part of the founding group.
insert into public.memberships (user_id, status, note)
select id, 'founder', 'Existing account when memberships were introduced' from auth.users
on conflict (user_id) do nothing;

-- Permanently deletes the signed-in user's account and all of their data. Rows are removed
-- children-first so that "on delete restrict" references to custom exercises never block it.
-- Other users' copies of a shared split are independent and are not affected; the share link
-- itself stops working.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.workout_sessions where user_id = v_user;   -- cascades to exercises and sets
  delete from public.split_shares where user_id = v_user;
  delete from public.splits where user_id = v_user;             -- cascades to templates, entries, periods
  delete from public.exercises where owner_id = v_user;
  delete from public.memberships where user_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;                     -- also removes sessions and identities
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.handle_new_membership() from public, anon, authenticated;
