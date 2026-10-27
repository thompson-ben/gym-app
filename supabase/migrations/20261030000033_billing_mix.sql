-- Paying members by plan, and how many are cancelling or have a failed payment, for the
-- admin dashboard's Money section. admin_overview() counts every membership, so test
-- accounts showed up in the "monthly · yearly" hint and the Cancelling tile while the
-- tiles beside them left them out. Same "Also count" rule as the rest of the dashboard.
--
-- Additive: one new function.

create or replace function public.admin_billing_mix(p_include text[] default '{}')
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
  return (
    select jsonb_build_object(
      'monthly', count(*) filter (where m.plan = 'monthly'),
      'yearly', count(*) filter (where m.plan = 'yearly'),
      'canceling', count(*) filter (where m.cancel_at_period_end),
      'billing_issue', count(*) filter (where m.billing_issue)
    )
    from public.memberships m
    where m.status = 'paid'
      and m.user_id not in (select user_id from public.admin_excluded_users(p_include))
  );
end;
$$;

revoke execute on function public.admin_billing_mix(text[]) from public, anon;
grant execute on function public.admin_billing_mix(text[]) to authenticated;
