-- "Saw pricing": one anonymous event per browser tab session when a visitor scrolls the landing
-- page's pricing section into view, so the dashboard shows how many visitors read that far.
-- Same privacy rules as visits (migration 13): no visitor id, no IP address, no user agent.
--
-- Additive: one more allowed event name, and a function for the dashboard.

alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events
  add constraint analytics_events_name_check check (name in ('visit', 'signup_view', 'pricing_view'));

create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('visit', 'signup_view', 'pricing_view') then
    return;
  end if;
  insert into public.analytics_events (
    name, path, referrer_host, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    from_meta_ad, device, country
  ) values (
    p_name,
    public.clean_text(p_props ->> 'path', 200),
    lower(public.clean_text(p_props ->> 'referrer_host', 120)),
    lower(public.clean_text(p_props ->> 'utm_source', 100)),
    lower(public.clean_text(p_props ->> 'utm_medium', 100)),
    public.clean_text(p_props ->> 'utm_campaign', 150),
    public.clean_text(p_props ->> 'utm_content', 150),
    public.clean_text(p_props ->> 'utm_term', 150),
    coalesce((p_props ->> 'from_meta_ad')::boolean, false),
    case when p_props ->> 'device' in ('mobile', 'tablet', 'desktop') then p_props ->> 'device' end,
    case when upper(p_props ->> 'country') ~ '^[A-Z]{2}$' then upper(p_props ->> 'country') end
  );
end;
$$;

-- Pricing views in the dashboard's range. Admins only.
create or replace function public.admin_pricing_views(p_days integer default 30)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return (
    select count(*) from public.analytics_events
    where name = 'pricing_view' and created_at >= date_trunc('day', now()) - make_interval(days => v_days - 1)
  );
end;
$$;

revoke execute on function public.admin_pricing_views(integer) from public, anon;
grant execute on function public.admin_pricing_views(integer) to authenticated;
