-- One-click unsubscribe from reminder emails.
--
-- profiles.reminder_emails: whether someone gets the optional reminder emails (first workout,
-- trial ending soon, trial ended). Account emails (confirming an address, password resets,
-- free access, referral rewards) are unaffected. People can switch it in Profile, or with the
-- unsubscribe link in those emails, which the server checks and passes on here with the
-- billing secret.
--
-- Additive: one column (default on, as now) and two functions.

alter table public.profiles add column if not exists reminder_emails boolean not null default true;

-- Everyone who has turned reminder emails off (the daily job skips them).
create or replace function public.reminder_opt_outs(p_secret text)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query select p.id from public.profiles p where not p.reminder_emails;
end;
$$;

-- Called by the unsubscribe link after the server has checked its signature.
create or replace function public.set_reminder_emails(p_secret text, p_user uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  insert into public.profiles (id, reminder_emails) values (p_user, p_enabled)
  on conflict (id) do update set reminder_emails = excluded.reminder_emails;
end;
$$;

revoke execute on function public.reminder_opt_outs(text), public.set_reminder_emails(text, uuid, boolean) from public, anon, authenticated;
-- Called by the server without a user session; each checks the billing secret.
grant execute on function public.reminder_opt_outs(text), public.set_reminder_emails(text, uuid, boolean) to anon, authenticated;
