-- One-off announcement emails to every member (for example, the iPhone app launching).
--
-- Each announcement goes to each person at most once: announcement_sends records who has had it,
-- so the job can be re-run or retried safely. Like reminder emails, anyone who has turned emails
-- off is skipped; everyone else with an account is included, test accounts too. Sent by the
-- server (/api/cron/announcement), behind the billing secret like the other email functions.
--
-- Additive: one table and two functions.

create table if not exists public.announcement_sends (
  announcement text not null check (char_length(announcement) between 1 and 60),
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (announcement, user_id)
);

alter table public.announcement_sends enable row level security;
revoke all on public.announcement_sends from anon, authenticated;

-- Who still needs this announcement: an email address, emails not turned off, not sent yet.
create or replace function public.announcement_recipients(p_secret text, p_announcement text, p_limit integer default 200)
returns table (user_id uuid, email text, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
    select u.id, u.email::text, p.display_name
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.email is not null
      and p.reminder_emails
      and not exists (select 1 from public.announcement_sends s where s.announcement = p_announcement and s.user_id = u.id)
    order by u.created_at
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

create or replace function public.mark_announcement_sent(p_secret text, p_announcement text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  insert into public.announcement_sends (announcement, user_id) values (p_announcement, p_user)
  on conflict do nothing;
end;
$$;

revoke execute on function public.announcement_recipients(text, text, integer), public.mark_announcement_sent(text, text, uuid) from public, anon, authenticated;
grant execute on function public.announcement_recipients(text, text, integer), public.mark_announcement_sent(text, text, uuid) to anon, authenticated;
