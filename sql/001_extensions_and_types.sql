-- ==========================================================
-- 001: Extensions and enum types
-- Run this first.
-- ==========================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fast partial-name search on students

create type employee_type as enum ('teaching', 'office', 'driver', 'other');
create type gender_type as enum ('male', 'female', 'other');
create type student_status as enum ('active', 'alumni', 'transferred_out', 'inactive');
create type enrollment_status as enum ('active', 'promoted', 'transferred', 'dropped');
create type fee_type as enum ('academic', 'bus', 'other');

-- Reusable updated_at trigger
create or replace function set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
