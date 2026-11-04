-- Subscriptions bought in the iOS app (Apple in-app purchase, through RevenueCat).
--
-- A membership is paid for either on the website (Stripe) or in the app (Apple); billing_source
-- says which, so each is managed in the right place and one never lapses the other. The
-- server applies RevenueCat's view of a subscriber (apple_apply_subscription) whenever
-- RevenueCat sends an event or the app finishes a purchase, and records App Store payments
-- for the dashboard (apple_record_payment; sandbox purchases are never recorded). All need
-- the billing secret, like the Stripe functions.
--
-- Additive: columns on memberships and payments, three new functions, and
-- billing_apply_subscription leaves a membership paid in the app alone.

alter table public.memberships
  add column if not exists billing_source text check (billing_source is null or billing_source in ('stripe', 'apple'));
update public.memberships set billing_source = 'stripe' where billing_source is null and stripe_subscription_id is not null;

alter table public.payments
  alter column stripe_invoice_id drop not null,
  add column if not exists apple_transaction_id text unique;
alter table public.payments
  add constraint payments_one_source check (stripe_invoice_id is not null or apple_transaction_id is not null);

-- RevenueCat's current view of a subscriber's NotchLift subscription. Founders keep founder
-- status; a membership paid on the website is never lapsed by the app not having one.
create or replace function public.apple_apply_subscription(
  p_secret text,
  p_user uuid,
  p_active boolean,
  p_plan text,
  p_expires_at timestamptz,
  p_will_renew boolean,
  p_billing_issue boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
begin
  perform public.assert_billing_secret(p_secret);
  select * into v_member from public.memberships where user_id = p_user for update;
  if not found then
    raise exception 'billing_user_not_found' using errcode = 'P0002';
  end if;
  if p_active then
    update public.memberships set
      status = case when status = 'founder' then status else 'paid' end,
      billing_source = 'apple',
      plan = case when p_plan in ('monthly', 'yearly') then p_plan else plan end,
      current_period_end = p_expires_at,
      cancel_at_period_end = not coalesce(p_will_renew, true),
      billing_issue = coalesce(p_billing_issue, false),
      billing_updated_at = now()
    where user_id = p_user;
    return 'paid';
  end if;
  if v_member.billing_source = 'apple' and v_member.status = 'paid' then
    update public.memberships set
      status = 'lapsed',
      cancel_at_period_end = false,
      billing_issue = false,
      billing_updated_at = now()
    where user_id = p_user;
    return 'lapsed';
  end if;
  return 'unchanged';
end;
$$;

create or replace function public.apple_record_payment(
  p_secret text,
  p_user uuid,
  p_transaction text,
  p_amount_pence integer,
  p_currency text,
  p_plan text,
  p_paid_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  insert into public.payments (user_id, apple_transaction_id, amount_pence, currency, plan, paid_at)
  values (p_user, p_transaction, p_amount_pence, lower(p_currency), case when p_plan in ('monthly', 'yearly') then p_plan end, p_paid_at)
  on conflict (apple_transaction_id) do nothing;
end;
$$;

-- Apple refunded a payment (the dashboard's revenue and refund window take it off).
create or replace function public.apple_mark_refunded(p_secret text, p_transaction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.payments set refunded_at = now() where apple_transaction_id = p_transaction and refunded_at is null;
end;
$$;

-- As in migration 14, except a membership paid in the app keeps its status and plan when a
-- (for example older, lapsed) Stripe subscription reports in.
create or replace function public.billing_apply_subscription(
  p_secret text,
  p_user uuid,
  p_customer text,
  p_subscription text,
  p_stripe_status text,
  p_plan text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
  v_status text;
begin
  perform public.assert_billing_secret(p_secret);
  select * into v_member from public.memberships
  where (p_user is not null and user_id = p_user) or (p_customer is not null and stripe_customer_id = p_customer)
  order by (user_id = p_user) desc nulls last
  limit 1
  for update;
  if not found then
    raise exception 'billing_user_not_found' using errcode = 'P0002';
  end if;
  if v_member.billing_updated_at is not null and p_event_at < v_member.billing_updated_at then
    return 'stale';
  end if;
  v_status := case
    when p_stripe_status in ('active', 'trialing', 'past_due') then 'paid'
    when p_stripe_status in ('canceled', 'unpaid', 'incomplete_expired') then 'lapsed'
    else null  -- 'incomplete' / 'paused': no change until Stripe settles it
  end;
  if v_member.billing_source = 'apple' and v_member.status = 'paid' and v_status is distinct from 'paid' then
    update public.memberships set stripe_customer_id = coalesce(p_customer, stripe_customer_id), stripe_subscription_id = p_subscription
    where user_id = v_member.user_id;
    return 'unchanged';
  end if;
  update public.memberships set
    status = case when status = 'founder' or v_status is null then status else v_status end,
    billing_source = case when v_status = 'paid' then 'stripe' else billing_source end,
    stripe_customer_id = coalesce(p_customer, stripe_customer_id),
    stripe_subscription_id = p_subscription,
    plan = case when p_plan in ('monthly', 'yearly') then p_plan else plan end,
    current_period_end = p_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
    billing_issue = p_stripe_status = 'past_due',
    billing_updated_at = p_event_at
  where user_id = v_member.user_id;
  return coalesce(v_status, 'unchanged');
end;
$$;

revoke execute on function
  public.apple_apply_subscription(text, uuid, boolean, text, timestamptz, boolean, boolean),
  public.apple_record_payment(text, uuid, text, integer, text, text, timestamptz),
  public.apple_mark_refunded(text, text)
from public, anon, authenticated;
-- Called by the app's server routes without a user session; each checks the billing secret.
grant execute on function
  public.apple_apply_subscription(text, uuid, boolean, text, timestamptz, boolean, boolean),
  public.apple_record_payment(text, uuid, text, integer, text, text, timestamptz),
  public.apple_mark_refunded(text, text)
to anon, authenticated;
