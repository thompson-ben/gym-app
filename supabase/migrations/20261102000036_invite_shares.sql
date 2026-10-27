-- Whether members actually share their invite link.
--
-- A trial member's invite code is made the first time they open Profile, so the dashboard's
-- "links created" counted Profile visits, not shares. The invite card now records each time
-- someone finishes the share sheet or copies the invite (note_invite_shared), and the admin
-- dashboard counts those (admin_invite_shares), with the same "Also count" rule as the rest.
--
-- Additive: one table and two functions.

create table public.invite_shares (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('share', 'copy')),
  created_at timestamptz not null default now()
);

create index invite_shares_created_idx on public.invite_shares (created_at);

alter table public.invite_shares enable row level security;
revoke all on public.invite_shares from anon, authenticated;

-- The signed-in member shared or copied their invite. Ignored without an invite code, and a
-- repeat within 10 seconds (a double tap) isn't counted twice.
create or replace function public.note_invite_shared(p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_method not in ('share', 'copy')
     or not exists (select 1 from public.referral_codes where user_id = v_user)
     or exists (select 1 from public.invite_shares where user_id = v_user and created_at > now() - interval '10 seconds') then
    return;
  end if;
  insert into public.invite_shares (user_id, method) values (v_user, p_method);
end;
$$;

-- Admin: in the range, how many people shared their invite and how many times.
create or replace function public.admin_invite_shares(p_days integer default 30, p_include text[] default '{}')
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
    select jsonb_build_object('people', count(distinct s.user_id), 'shares', count(*))
    from public.invite_shares s
    where s.created_at >= v_since
      and s.user_id not in (select user_id from public.admin_excluded_users(p_include))
  );
end;
$$;

revoke execute on function public.note_invite_shared(text), public.admin_invite_shares(integer, text[]) from public, anon;
grant execute on function public.note_invite_shared(text), public.admin_invite_shares(integer, text[]) to authenticated;
