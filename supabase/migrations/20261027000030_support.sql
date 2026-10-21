-- Support inbox: members message us from Profile → Help & support, and admins reply from
-- Admin → Support. One thread per question; replies are kept with it.
--
-- Threads are open (waiting on us), answered (waiting on them) or closed. A member's reply
-- reopens a thread; an admin reply marks it answered, or closed when they say so.
-- Members only ever see their own threads; everything is written through the functions below
-- (with limits so the inbox can't be flooded). Deleting an account deletes its threads.
-- The app emails a notice for each new message (members: replies; admins: the contact address).
--
-- Additive: two new tables and new functions.

create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null default 'other' check (topic in ('account', 'billing', 'logging', 'bug', 'other')),
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  -- The screen, app build and device when the thread was started, to help with problems.
  page text check (page is null or char_length(page) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 80),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_user_at timestamptz not null default now(),
  last_support_at timestamptz,
  -- When the member last opened the thread: replies after this are unread.
  user_seen_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  author text not null check (author in ('user', 'support')),
  -- The admin who replied (kept as a name in case they stop being an admin).
  admin_id uuid references auth.users (id) on delete set null,
  admin_name text check (admin_name is null or char_length(admin_name) <= 60),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_threads_user_idx on public.support_threads (user_id, last_user_at desc);
create index support_threads_status_idx on public.support_threads (status, last_user_at desc);
create index support_messages_thread_idx on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
create policy "support threads: read own" on public.support_threads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "support messages: read own" on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
-- Writes go through the functions below only.
revoke insert, update, delete, truncate on public.support_threads, public.support_messages from anon, authenticated;
revoke all on public.support_threads, public.support_messages from anon;

-- A thread with its messages, for its owner or an admin.
create or replace function public.support_thread_json(p_thread uuid, p_for_admin boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'topic', t.topic, 'subject', t.subject, 'status', t.status,
    'created_at', t.created_at, 'last_user_at', t.last_user_at, 'last_support_at', t.last_support_at,
    'user_seen_at', t.user_seen_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'admin_name', m.admin_name, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.thread_id = t.id
    ), '[]'::jsonb)
  ) || case when p_for_admin then jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = t.user_id),
    'display_name', (select p.display_name from public.profiles p where p.id = t.user_id),
    'joined_at', (select u.created_at from auth.users u where u.id = t.user_id),
    'membership', (select m.status from public.memberships m where m.user_id = t.user_id),
    'page', t.page, 'app_version', t.app_version, 'user_agent', t.user_agent
  ) else '{}'::jsonb end
  from public.support_threads t
  where t.id = p_thread;
$$;

-- Member: start a thread. Returns it (with the first message).
create or replace function public.support_start(
  p_topic text, p_subject text, p_body text,
  p_page text default null, p_app_version text default null, p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_thread uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_subject)), 0) not between 1 and 120 or coalesce(char_length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if (select count(*) from public.support_threads where user_id = v_user and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_messages' using errcode = '22023';
  end if;
  insert into public.support_threads (user_id, topic, subject, page, app_version, user_agent)
  values (v_user, coalesce(nullif(p_topic, ''), 'other'), btrim(p_subject), left(p_page, 200), left(p_app_version, 80), left(p_user_agent, 400))
  returning id into v_thread;
  insert into public.support_messages (thread_id, author, body) values (v_thread, 'user', btrim(p_body));
  return public.support_thread_json(v_thread, false);
end;
$$;

-- Member: reply on their own thread (reopens it).
create or replace function public.support_reply(p_thread uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.support_threads where id = p_thread and user_id = v_user) then
    raise exception 'thread_not_found' using errcode = 'P0002';
  end if;
  if coalesce(char_length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  if (select count(*) from public.support_messages m join public.support_threads t on t.id = m.thread_id
      where t.user_id = v_user and m.author = 'user' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many_messages' using errcode = '22023';
  end if;
  insert into public.support_messages (thread_id, author, body) values (p_thread, 'user', btrim(p_body));
  update public.support_threads set status = 'open', last_user_at = now(), user_seen_at = now() where id = p_thread;
  return public.support_thread_json(p_thread, false);
end;
$$;

-- Member: their thread, marked as read.
create or replace function public.support_open_thread(p_thread uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads set user_seen_at = now() where id = p_thread and user_id = auth.uid();
  if not found then
    return null;
  end if;
  return public.support_thread_json(p_thread, false);
end;
$$;

-- Member: how many of their threads have a reply they haven't opened (for the Profile badge).
create or replace function public.support_unread()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.support_threads
  where user_id = auth.uid() and last_support_at is not null and last_support_at > user_seen_at;
$$;

-- Admin: threads by status, newest activity first.
create or replace function public.admin_support_threads(p_status text default 'open')
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
    'counts', (select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'answered', count(*) filter (where status = 'answered'),
      'closed', count(*) filter (where status = 'closed')) from public.support_threads),
    'threads', coalesce((
      select jsonb_agg(x order by x.last_at desc) from (
        select t.id, t.topic, t.subject, t.status, t.created_at, greatest(t.last_user_at, coalesce(t.last_support_at, t.last_user_at)) as last_at,
          u.email, p.display_name,
          (select count(*) from public.support_messages m where m.thread_id = t.id) as messages,
          (select left(m.body, 140) from public.support_messages m where m.thread_id = t.id order by m.created_at desc limit 1) as preview
        from public.support_threads t
        join auth.users u on u.id = t.user_id
        left join public.profiles p on p.id = t.user_id
        where t.status = coalesce(nullif(p_status, ''), 'open')
        order by greatest(t.last_user_at, coalesce(t.last_support_at, t.last_user_at)) desc
        limit 200
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_support_thread(p_thread uuid)
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
  return public.support_thread_json(p_thread, true);
end;
$$;

-- Admin: reply (marks the thread answered, or closed with p_close). Returns the thread, with
-- the member's email so the app can let them know.
create or replace function public.admin_support_reply(p_thread uuid, p_body text, p_close boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.support_threads where id = p_thread) then
    raise exception 'thread_not_found' using errcode = 'P0002';
  end if;
  if coalesce(char_length(btrim(p_body)), 0) not between 1 and 4000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
  insert into public.support_messages (thread_id, author, admin_id, admin_name, body)
  values (p_thread, 'support', v_admin, (select left(nullif(btrim(p.display_name), ''), 60) from public.profiles p where p.id = v_admin), btrim(p_body));
  update public.support_threads set status = case when p_close then 'closed' else 'answered' end, last_support_at = now()
  where id = p_thread;
  return public.support_thread_json(p_thread, true);
end;
$$;

create or replace function public.admin_support_set_status(p_thread uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.support_threads set status = p_status where id = p_thread;
end;
$$;

revoke execute on function public.support_thread_json(uuid, boolean), public.support_start(text, text, text, text, text, text),
  public.support_reply(uuid, text), public.support_open_thread(uuid), public.support_unread(),
  public.admin_support_threads(text), public.admin_support_thread(uuid), public.admin_support_reply(uuid, text, boolean),
  public.admin_support_set_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.support_start(text, text, text, text, text, text), public.support_reply(uuid, text),
  public.support_open_thread(uuid), public.support_unread(),
  public.admin_support_threads(text), public.admin_support_thread(uuid), public.admin_support_reply(uuid, text, boolean),
  public.admin_support_set_status(uuid, text)
  to authenticated;
