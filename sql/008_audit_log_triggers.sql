-- ==========================================================
-- 008: Audit log triggers
-- Run after 007_broaden_profile_read.sql.
--
-- The audit_logs table and its RLS (Admin-only read, insert-only,
-- no update/delete ever) have existed since Phase 1. This is what
-- actually populates it: a database trigger, not application code,
-- so it can't be bypassed by calling the API a different way and
-- can't be forgotten when a new form is added later.
--
-- The trigger function runs with the INVOKING user's own
-- privileges (it is NOT security definer) and inserts
-- actor_id = auth.uid() — i.e. the person who made the change —
-- which is exactly what the existing "audit_logs: self-attributed
-- insert" RLS policy already permits. No privilege escalation,
-- no new grants needed.
--
-- Each row stores a full before/after snapshot of the changed row
-- as jsonb. That's intentionally verbose (it's what makes "what
-- exactly changed" answerable later) and is safe specifically
-- because audit_logs is Admin-only readable — nobody else can see
-- it, so there's no broader exposure from storing full rows.
-- ==========================================================

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_changes jsonb;
begin
  if tg_op = 'DELETE' then
    v_entity_id := old.id;
    v_changes := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    v_entity_id := new.id;
    v_changes := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    v_entity_id := new.id;
    v_changes := jsonb_build_object('new', to_jsonb(new));
  end if;

  insert into audit_logs (actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_entity_id, v_changes);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Student identity + status changes (create, edit, deactivate).
create trigger trg_audit_students
  after insert or update on students
  for each row execute function audit_log_trigger();

-- Employee records.
create trigger trg_audit_employees
  after insert or update on employees
  for each row execute function audit_log_trigger();

-- Fee payments — insert-only at the table level already, but still logged.
create trigger trg_audit_fee_payments
  after insert on fee_payments
  for each row execute function audit_log_trigger();

-- Fee assignments, including discounts — financially sensitive.
create trigger trg_audit_student_fee_assignments
  after insert or update on student_fee_assignments
  for each row execute function audit_log_trigger();

-- Marks entry/correction.
create trigger trg_audit_marks
  after insert or update on marks
  for each row execute function audit_log_trigger();

-- Transport assignment changes, including removal (bus fee is per-student
-- and financially sensitive, so deletions are logged too, not just inserts).
create trigger trg_audit_student_transport_assignments
  after insert or update or delete on student_transport_assignments
  for each row execute function audit_log_trigger();

-- Bus fleet changes (insurance/FC expiry matters for compliance).
create trigger trg_audit_buses
  after insert or update on buses
  for each row execute function audit_log_trigger();

-- Enrollment/promotion — a student's class/section/year assignment.
create trigger trg_audit_student_academic_records
  after insert or update on student_academic_records
  for each row execute function audit_log_trigger();
