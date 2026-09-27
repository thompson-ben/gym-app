-- Activating a split from an earlier date.
--
-- activate_split gains an optional start date. The currently open period (another split) is
-- closed at that date instead of now; re-activating the current split with a date moves its
-- start. Overlaps with earlier periods and future dates are rejected, exactly as for manual
-- period corrections.

drop function if exists public.activate_split(uuid);

create or replace function public.activate_split(p_split_id uuid, p_started_at timestamptz default null)
returns public.split_active_periods
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_open public.split_active_periods;
  v_new public.split_active_periods;
  v_start timestamptz := coalesce(p_started_at, now());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_start > now() + interval '1 minute' then
    raise exception 'period_starts_in_future' using errcode = '22023';
  end if;
  perform public.lock_user_activation(v_user);

  if not exists (select 1 from public.splits where id = p_split_id and user_id = v_user) then
    raise exception 'split_not_found' using errcode = 'P0002';
  end if;

  select * into v_open from public.split_active_periods
  where user_id = v_user and ended_at is null
  for update;

  begin
    if found and v_open.split_id = p_split_id then
      -- Already active: a repeated request is a no-op; a date moves the start.
      if p_started_at is null or p_started_at = v_open.started_at then
        return v_open;
      end if;
      update public.split_active_periods set started_at = v_start
      where id = v_open.id
      returning * into v_new;
      return v_new;
    end if;

    if found then
      if p_started_at is null then
        v_start := greatest(v_start, v_open.started_at + interval '1 second');
      elsif v_start <= v_open.started_at then
        -- The new split cannot start before the one it replaces did.
        raise exception 'period_overlaps' using errcode = '22023';
      end if;
      update public.split_active_periods set ended_at = v_start where id = v_open.id;
    end if;

    insert into public.split_active_periods (user_id, split_id, started_at)
    values (v_user, p_split_id, v_start)
    returning * into v_new;
  exception when exclusion_violation then
    raise exception 'period_overlaps' using errcode = '22023';
  end;
  return v_new;
end;
$$;

revoke execute on function public.activate_split(uuid, timestamptz) from public, anon;
grant execute on function public.activate_split(uuid, timestamptz) to authenticated;
