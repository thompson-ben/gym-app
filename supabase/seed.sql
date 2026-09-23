-- LOCAL DEVELOPMENT / DEMO DATA ONLY.
--
-- Loaded by `supabase db reset` on a local stack. It is never applied by `supabase db push`
-- and is not attached to newly registered accounts. It creates one clearly labelled demo
-- account:
--
--   email:    demo@splitmate.test
--   password: splitmate-demo
--
-- The only training history is the real reference workout (Chest & back, 21 September 2026).
-- Nothing else is invented. "Incline press" is mapped to the catalogue's Incline Barbell
-- Bench Press; change the exercise in the app if it was a different variation.

do $$
declare
  v_user uuid := '00000000-0000-4000-8000-00000000d3e0';
  v_split uuid := '00000000-0000-4000-8000-0000000051a1';
  v_holiday uuid := '00000000-0000-4000-8000-0000000051a2';
  v_tpl_cb uuid := '00000000-0000-4000-8000-00000000c0b1';
  v_tpl_legs uuid := '00000000-0000-4000-8000-00000000c0b2';
  v_tpl_fa uuid := '00000000-0000-4000-8000-00000000c0b3';
  v_tpl_fb uuid := '00000000-0000-4000-8000-00000000c0b4';
  v_session uuid := '00000000-0000-4000-8000-00000000ce55';
  v_incline uuid := md5('splitmate.catalogue:incline-barbell-bench-press')::uuid;
  v_pulldown uuid := md5('splitmate.catalogue:lat-pulldown')::uuid;
  v_dip uuid := md5('splitmate.catalogue:dip')::uuid;
  v_te_incline uuid := gen_random_uuid();
  v_te_pulldown uuid := gen_random_uuid();
  v_te_dip uuid := gen_random_uuid();
  v_se uuid;
  v_done timestamptz := '2026-09-21 18:05:00+01';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'demo@splitmate.test', extensions.crypt('splitmate-demo', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"demo":true}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user, v_user::text,
    jsonb_build_object('sub', v_user::text, 'email', 'demo@splitmate.test', 'email_verified', true),
    'email', now(), now(), now());

  update public.profiles set display_name = 'Demo (local seed)' where id = v_user;

  insert into public.splits (id, user_id, name, description) values
    (v_split, v_user, 'My 3-day split', 'Demo data from the local seed.'),
    (v_holiday, v_user, 'Holiday split', 'Demo data from the local seed. Two full-body days.');

  insert into public.workout_templates (id, user_id, split_id, name, position) values
    (v_tpl_cb, v_user, v_split, 'Chest & back', 0),
    (v_tpl_legs, v_user, v_split, 'Legs', 1),
    (v_tpl_fa, v_user, v_holiday, 'Full Body A', 0),
    (v_tpl_fb, v_user, v_holiday, 'Full Body B', 1);

  insert into public.template_exercises
    (id, user_id, template_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds) values
    (v_te_incline, v_user, v_tpl_cb, v_incline, 0, 2, 8, 12, 150),
    (v_te_pulldown, v_user, v_tpl_cb, v_pulldown, 1, 2, 8, 12, 120),
    (v_te_dip, v_user, v_tpl_cb, v_dip, 2, 2, 8, 12, 120),
    (gen_random_uuid(), v_user, v_tpl_legs, md5('splitmate.catalogue:back-squat')::uuid, 0, 2, 8, 12, 180),
    (gen_random_uuid(), v_user, v_tpl_legs, md5('splitmate.catalogue:lying-leg-curl')::uuid, 1, 2, 8, 12, 120),
    (gen_random_uuid(), v_user, v_tpl_legs, md5('splitmate.catalogue:standing-calf-raise')::uuid, 2, 2, 8, 12, 90),
    (gen_random_uuid(), v_user, v_tpl_fa, v_incline, 0, 2, 8, 12, 150),
    (gen_random_uuid(), v_user, v_tpl_fa, md5('splitmate.catalogue:leg-press')::uuid, 1, 2, 8, 12, 150),
    (gen_random_uuid(), v_user, v_tpl_fa, md5('splitmate.catalogue:seated-cable-row')::uuid, 2, 2, 8, 12, 120),
    (gen_random_uuid(), v_user, v_tpl_fb, v_pulldown, 0, 2, 8, 12, 120),
    (gen_random_uuid(), v_user, v_tpl_fb, md5('splitmate.catalogue:barbell-romanian-deadlift')::uuid, 1, 2, 8, 12, 150),
    (gen_random_uuid(), v_user, v_tpl_fb, v_dip, 2, 2, 8, 12, 120);

  insert into public.split_active_periods (user_id, split_id, started_at)
  values (v_user, v_split, '2026-09-21 08:00:00+01');

  -- Reference workout: Chest & back, 21 September 2026.
  insert into public.workout_sessions
    (id, user_id, split_id, template_id, split_name, template_name, status, started_at, completed_at, revision)
  values (v_session, v_user, v_split, v_tpl_cb, 'My 3-day split', 'Chest & back', 'in_progress',
    '2026-09-21 17:00:00+01', null, 0);

  insert into public.session_exercises (id, user_id, session_id, exercise_id, template_exercise_id, position,
    exercise_name, target_sets, rep_min, rep_max, rest_seconds)
  values (gen_random_uuid(), v_user, v_session, v_incline, v_te_incline, 0, 'Incline Barbell Bench Press', 2, 8, 12, 150)
  returning id into v_se;
  insert into public.session_sets (user_id, session_exercise_id, position, weight_kg, reps, completed_at) values
    (v_user, v_se, 0, 72.5, 9, '2026-09-21 17:10:00+01'),
    (v_user, v_se, 1, 72.5, 6, '2026-09-21 17:14:00+01');

  insert into public.session_exercises (id, user_id, session_id, exercise_id, template_exercise_id, position,
    exercise_name, target_sets, rep_min, rep_max, rest_seconds)
  values (gen_random_uuid(), v_user, v_session, v_pulldown, v_te_pulldown, 1, 'Lat Pulldown', 2, 8, 12, 120)
  returning id into v_se;
  insert into public.session_sets (user_id, session_exercise_id, position, weight_kg, reps, completed_at) values
    (v_user, v_se, 0, 70, 12, '2026-09-21 17:30:00+01'),
    (v_user, v_se, 1, 70, 8, '2026-09-21 17:34:00+01');

  insert into public.session_exercises (id, user_id, session_id, exercise_id, template_exercise_id, position,
    exercise_name, target_sets, rep_min, rep_max, rest_seconds)
  values (gen_random_uuid(), v_user, v_session, v_dip, v_te_dip, 2, 'Dip', 2, 8, 12, 120)
  returning id into v_se;
  -- Weighted dips: +10 kg added load.
  insert into public.session_sets (user_id, session_exercise_id, position, weight_kg, reps, completed_at) values
    (v_user, v_se, 0, 10, 10, '2026-09-21 17:50:00+01'),
    (v_user, v_se, 1, 10, 10, '2026-09-21 17:55:00+01');

  update public.workout_sessions set status = 'completed', completed_at = v_done, revision = 1
  where id = v_session;
end;
$$;
