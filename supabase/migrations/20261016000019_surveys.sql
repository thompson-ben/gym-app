-- One-question surveys: why people come, how the trial is going, and why they leave.
--
--   heard_from     "How did you hear about NotchLift?"  asked on Train soon after sign-up.
--   trial_pulse    "How's it going so far?"             asked after finishing a workout, from day 4 of a trial.
--   trial_exit     "What stopped you?"                  asked once a trial has ended without paying,
--                                                        in the app and in one email.
--   cancel_reason  Stripe's own cancellation question, stored when a member cancels in the
--                  billing portal (written by the webhook with the billing secret).
--
-- Each question is answered (or skipped) at most once per person; a skip is stored as
-- 'skipped' so it is never asked again. Answers are fixed codes plus optional short text.
-- Separate from public.feedback (free-text "Send feedback" messages), which is unchanged.
--
-- Additive: one table, one column on memberships and new functions.

create table public.survey_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (question in ('heard_from', 'trial_pulse', 'trial_exit', 'cancel_reason')),
  answer text not null check (answer ~ '^[a-z_]{1,40}$'),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, question)
);
create index survey_answers_created_idx on public.survey_answers (created_at desc);

alter table public.survey_answers enable row level security;
-- Written and read only through the functions below.
revoke all on public.survey_answers from anon, authenticated;

alter table public.memberships add column if not exists trial_exit_emailed_at timestamptz;

-- The answers each question accepts.
create or replace function public.survey_answer_ok(p_question text, p_answer text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_answer = 'skipped' and p_question <> 'cancel_reason' or p_answer = any (case p_question
    when 'heard_from' then array['instagram', 'facebook', 'tiktok', 'friend', 'search', 'other']
    when 'trial_pulse' then array['bad', 'ok', 'great']
    when 'trial_exit' then array['too_expensive', 'not_training', 'missing_feature', 'other_app', 'just_looking', 'other']
    -- Stripe's cancellation_details.feedback values.
    when 'cancel_reason' then array['customer_service', 'low_quality', 'missing_features', 'other', 'switched_service', 'too_complex', 'too_expensive', 'unused']
    else array[]::text[]
  end);
$$;

-- Which questions the caller should be asked now, in the order the app shows them.
create or replace function public.my_survey_prompts()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_created timestamptz;
  v_m public.memberships;
  v_done text[];
  v_out text[] := array[]::text[];
begin
  if v_user is null then
    return v_out;
  end if;
  select created_at into v_created from auth.users where id = v_user;
  select * into v_m from public.memberships where user_id = v_user;
  select coalesce(array_agg(question), array[]::text[]) into v_done from public.survey_answers where user_id = v_user;

  -- New accounts only: it's about where people came from.
  if not 'heard_from' = any (v_done) and v_created > now() - interval '30 days' then
    v_out := array_append(v_out, 'heard_from');
  end if;
  if v_m.status = 'trial' and v_m.trial_ends_at is not null then
    if v_m.trial_ends_at > now() then
      if not 'trial_pulse' = any (v_done)
        and v_created <= now() - interval '4 days'
        and exists (select 1 from public.workout_sessions ws where ws.user_id = v_user and ws.status = 'completed') then
        v_out := array_append(v_out, 'trial_pulse');
      end if;
    elsif not 'trial_exit' = any (v_done)
      and not exists (select 1 from public.payments p where p.user_id = v_user) then
      v_out := array_append(v_out, 'trial_exit');
    end if;
  end if;
  return v_out;
end;
$$;

-- Saves the caller's answer (or 'skipped'). Answering again replaces it.
create or replace function public.submit_survey(p_question text, p_answer text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_question not in ('heard_from', 'trial_pulse', 'trial_exit') or not public.survey_answer_ok(p_question, p_answer) then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;
  insert into public.survey_answers (user_id, question, answer, detail)
  values (v_user, p_question, p_answer, left(v_detail, 500))
  on conflict (user_id, question) do update set answer = excluded.answer, detail = excluded.detail, created_at = now();
end;
$$;

-- The webhook: a member gave a reason when cancelling in Stripe's billing page.
create or replace function public.record_cancellation_reason(p_secret text, p_user uuid, p_reason text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  if p_user is null or not public.survey_answer_ok('cancel_reason', p_reason) then
    return;
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return;
  end if;
  insert into public.survey_answers (user_id, question, answer, detail)
  values (p_user, 'cancel_reason', p_reason, left(nullif(btrim(coalesce(p_comment, '')), ''), 500))
  on conflict (user_id, question) do update set answer = excluded.answer, detail = excluded.detail, created_at = now()
  -- Stripe repeats the same details on later updates; keep the original date.
  where (public.survey_answers.answer, public.survey_answers.detail) is distinct from (excluded.answer, excluded.detail);
end;
$$;

-- The daily job: trials that ended in the last 3 days without paying, not yet asked by email.
create or replace function public.trial_exit_emails_due(p_secret text)
returns table (user_id uuid, email text, display_name text, trial_ends_at timestamptz, workouts integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  return query
  select m.user_id, u.email::text, p.display_name, m.trial_ends_at,
    (select count(*)::integer from public.workout_sessions ws where ws.user_id = m.user_id and ws.status = 'completed')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.status = 'trial'
    and m.trial_ends_at <= now() and m.trial_ends_at > now() - interval '3 days'
    and m.trial_exit_emailed_at is null
    and u.email_confirmed_at is not null
    and not exists (select 1 from public.payments pay where pay.user_id = m.user_id)
    and not exists (select 1 from public.survey_answers s where s.user_id = m.user_id and s.question = 'trial_exit')
  limit 200;
end;
$$;

create or replace function public.mark_trial_exit_emailed(p_secret text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing_secret(p_secret);
  update public.memberships set trial_exit_emailed_at = now() where user_id = p_user;
end;
$$;

-- Admin dashboard: answers in the range, overall and by where people came from, plus the
-- latest written comments. Admins and test accounts are left out.
create or replace function public.admin_surveys(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365) - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  with rows as (
    select s.user_id, s.question, s.answer, s.detail, s.created_at,
      public.source_label(a.utm_source, a.referrer_host, coalesce(a.from_meta_ad, false)) as source,
      coalesce(a.utm_campaign, '') as campaign,
      coalesce(a.utm_content, '') as content
    from public.survey_answers s
    left join public.user_attribution a on a.user_id = s.user_id
    where s.created_at >= v_since
      and s.user_id not in (select user_id from public.admins)
      and s.user_id not in (select user_id from public.analytics_excluded_users)
  )
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'answers', (
      select coalesce(jsonb_agg(jsonb_build_object('question', question, 'answer', answer, 'count', n) order by question, n desc, answer), '[]'::jsonb)
      from (select question, answer, count(*) as n from rows group by question, answer) t
    ),
    'by_campaign', (
      select coalesce(jsonb_agg(jsonb_build_object('question', question, 'source', source, 'campaign', campaign, 'content', content, 'answer', answer, 'count', n)
        order by question, source, campaign, content, n desc), '[]'::jsonb)
      from (
        select question, source, campaign, content, answer, count(*) as n from rows
        where answer <> 'skipped' and (campaign <> '' or content <> '')
        group by question, source, campaign, content, answer
      ) t
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object('question', r.question, 'answer', r.answer, 'detail', r.detail, 'at', r.created_at,
          'email', u.email, 'source', r.source, 'campaign', r.campaign) order by r.created_at desc), '[]'::jsonb)
      from (select * from rows where detail is not null order by created_at desc limit 50) r
      join auth.users u on u.id = r.user_id
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function
  public.survey_answer_ok(text, text), public.my_survey_prompts(), public.submit_survey(text, text, text),
  public.record_cancellation_reason(text, uuid, text, text), public.trial_exit_emails_due(text),
  public.mark_trial_exit_emailed(text, uuid), public.admin_surveys(integer)
from public, anon, authenticated;
grant execute on function public.my_survey_prompts(), public.submit_survey(text, text, text), public.admin_surveys(integer) to authenticated;
-- Called by the webhook and the daily job without a user session; each checks the billing secret.
grant execute on function public.record_cancellation_reason(text, uuid, text, text), public.trial_exit_emails_due(text),
  public.mark_trial_exit_emailed(text, uuid) to anon, authenticated;
