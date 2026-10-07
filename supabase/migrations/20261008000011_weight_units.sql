-- Pounds as a display unit.
--
-- Weights stay stored in kilograms (the canonical unit). This migration:
-- 1. lets profiles choose 'lb' as well as 'kg' (display and input only);
-- 2. stores set weights and target increments with 4 decimal places, so a weight typed in
--    pounds (to 0.01 lb) converts to kg and back to exactly what was typed.
-- Widening numeric precision keeps every existing value unchanged (72.5 stays 72.5).

do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%weight_unit%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_weight_unit_check check (weight_unit in ('kg', 'lb'));

alter table public.session_sets alter column weight_kg type numeric(9, 4);
alter table public.template_exercises alter column progression_increment_kg type numeric(7, 4);
