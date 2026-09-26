-- Profiles for accounts created before the schema existed.
--
-- A profile row is created by the on_auth_user_created trigger, so accounts that signed up
-- before the migrations were applied have none. Backfill them, and let a signed-in user create
-- their own row so the app can repair a missing profile by itself.

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create policy "profiles: create own row" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
