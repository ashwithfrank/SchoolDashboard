-- ==========================================================
-- 004: Row Level Security
-- Authorization is enforced here, at the database — never only
-- in the frontend. Run after 003_views.sql.
-- ==========================================================

-- ---------- Helper: does the current user's role have this permission? ----------
-- Lives in `public` (not `auth`) — Supabase reserves the auth schema for its
-- own use, so custom authorization helpers belong in public.
create or replace function public.has_permission(perm_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    join permissions perm on perm.id = rp.permission_id
    where p.id = auth.uid()
      and perm.code = perm_code
      and p.is_active
  );
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_active
  );
$$;

-- ---------- Enable RLS everywhere ----------
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table academic_years enable row level security;
alter table classes enable row level security;
alter table sections enable row level security;
alter table employees enable row level security;
alter table section_coordinators enable row level security;
alter table buses enable row level security;
alter table students enable row level security;
alter table student_academic_records enable row level security;
alter table student_transport_assignments enable row level security;
alter table subjects enable row level security;
alter table class_subjects enable row level security;
alter table fee_structures enable row level security;
alter table student_fee_assignments enable row level security;
alter table fee_payments enable row level security;
alter table exams enable row level security;
alter table exam_subjects enable row level security;
alter table marks enable row level security;
alter table audit_logs enable row level security;

-- ---------- Reference tables: readable by any active staff, managed by Admin ----------

create policy "roles: read" on roles for select using (is_active_staff());
create policy "roles: manage" on roles for all
  using (has_permission('staff_accounts.manage'))
  with check (has_permission('staff_accounts.manage'));

create policy "permissions: read" on permissions for select using (is_active_staff());
create policy "permissions: manage" on permissions for all
  using (has_permission('staff_accounts.manage'))
  with check (has_permission('staff_accounts.manage'));

create policy "role_permissions: read" on role_permissions for select using (is_active_staff());
create policy "role_permissions: manage" on role_permissions for all
  using (has_permission('staff_accounts.manage'))
  with check (has_permission('staff_accounts.manage'));

-- ---------- Profiles ----------

create policy "profiles: read own or admin" on profiles for select
  using (id = auth.uid() or has_permission('staff_accounts.manage'));

create policy "profiles: admin inserts" on profiles for insert
  with check (has_permission('staff_accounts.manage'));

create policy "profiles: admin or self update" on profiles for update
  using (id = auth.uid() or has_permission('staff_accounts.manage'))
  with check (id = auth.uid() or has_permission('staff_accounts.manage'));

-- Extra guardrail: a non-admin may update their own row (e.g. display name)
-- but may not change their own role, employee link, or active flag.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission('staff_accounts.manage') then
    if new.role_id is distinct from old.role_id
       or new.employee_id is distinct from old.employee_id
       or new.is_active is distinct from old.is_active then
      raise exception 'Only an administrator can change role, employee link, or active status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_no_self_escalation
  before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- ---------- Academic years ----------

create policy "academic_years: read" on academic_years for select using (is_active_staff());
create policy "academic_years: manage" on academic_years for insert
  with check (has_permission('academic_years.manage'));
create policy "academic_years: update" on academic_years for update
  using (has_permission('academic_years.manage'))
  with check (has_permission('academic_years.manage'));

-- ---------- Classes / sections / coordinators ----------

create policy "classes: read" on classes for select using (is_active_staff());
create policy "classes: manage" on classes for all
  using (has_permission('classes_sections.manage'))
  with check (has_permission('classes_sections.manage'));

create policy "sections: read" on sections for select using (is_active_staff());
create policy "sections: manage" on sections for all
  using (has_permission('classes_sections.manage'))
  with check (has_permission('classes_sections.manage'));

create policy "section_coordinators: read" on section_coordinators for select using (is_active_staff());
create policy "section_coordinators: manage" on section_coordinators for all
  using (has_permission('classes_sections.manage'))
  with check (has_permission('classes_sections.manage'));

-- ---------- Employees / buses ----------

create policy "employees: read" on employees for select using (is_active_staff());
create policy "employees: manage" on employees for all
  using (has_permission('employees.manage'))
  with check (has_permission('employees.manage'));

create policy "buses: read" on buses for select using (is_active_staff());
create policy "buses: manage" on buses for all
  using (has_permission('buses.manage'))
  with check (has_permission('buses.manage'));

-- ---------- Students ----------

create policy "students: read" on students for select using (is_active_staff());

create policy "students: admin inserts" on students for insert
  with check (has_permission('students.manage'));

create policy "students: admin or edit-permission updates" on students for update
  using (has_permission('students.manage') or has_permission('students.edit'))
  with check (has_permission('students.manage') or has_permission('students.edit'));

-- Only Admin may change status (deactivate / mark alumni / transfer out).
create or replace function public.prevent_unauthorized_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not has_permission('students.manage') then
    raise exception 'Only an administrator can change a student''s status.';
  end if;
  return new;
end;
$$;

create trigger trg_students_status_guard
  before update on students
  for each row execute function prevent_unauthorized_status_change();

-- ---------- Student academic records (enrollment / promotion) ----------

create policy "student_academic_records: read" on student_academic_records for select
  using (is_active_staff());
create policy "student_academic_records: manage" on student_academic_records for all
  using (has_permission('students.manage'))
  with check (has_permission('students.manage'));

-- ---------- Transport (contains per-student fee — Admin + Office only) ----------

create policy "student_transport_assignments: read" on student_transport_assignments for select
  using (has_permission('transport.manage') or has_permission('fee_reports.view'));
create policy "student_transport_assignments: manage" on student_transport_assignments for all
  using (has_permission('transport.manage'))
  with check (has_permission('transport.manage'));

-- ---------- Subjects / class_subjects (Admin + Teaching) ----------

create policy "subjects: read" on subjects for select using (is_active_staff());
create policy "subjects: manage" on subjects for all
  using (has_permission('subjects.manage'))
  with check (has_permission('subjects.manage'));

create policy "class_subjects: read" on class_subjects for select using (is_active_staff());
create policy "class_subjects: manage" on class_subjects for all
  using (has_permission('subjects.manage'))
  with check (has_permission('subjects.manage'));

-- ---------- Fee structures / assignments (Admin + Office) ----------

create policy "fee_structures: read" on fee_structures for select
  using (has_permission('academic_fees.manage') or has_permission('fee_reports.view'));
create policy "fee_structures: manage" on fee_structures for all
  using (has_permission('academic_fees.manage'))
  with check (has_permission('academic_fees.manage'));

create policy "student_fee_assignments: read" on student_fee_assignments for select
  using (has_permission('academic_fees.manage') or has_permission('fee_reports.view'));
create policy "student_fee_assignments: manage" on student_fee_assignments for all
  using (has_permission('academic_fees.manage'))
  with check (has_permission('academic_fees.manage'));

-- ---------- Fee payments (append-only: no update/delete policy at all) ----------

create policy "fee_payments: read" on fee_payments for select
  using (has_permission('fee_payments.record') or has_permission('fee_reports.view'));
create policy "fee_payments: insert" on fee_payments for insert
  with check (has_permission('fee_payments.record') and recorded_by = auth.uid());

-- ---------- Exams / exam_subjects / marks (Admin + Teaching) ----------

create policy "exams: read" on exams for select
  using (has_permission('exams.manage') or has_permission('academic_reports.view'));
create policy "exams: manage" on exams for all
  using (has_permission('exams.manage'))
  with check (has_permission('exams.manage'));

create policy "exam_subjects: read" on exam_subjects for select
  using (has_permission('exams.manage') or has_permission('academic_reports.view'));
create policy "exam_subjects: manage" on exam_subjects for all
  using (has_permission('exams.manage'))
  with check (has_permission('exams.manage'));

create policy "marks: read" on marks for select
  using (has_permission('marks.manage') or has_permission('academic_reports.view'));
create policy "marks: insert" on marks for insert
  with check (has_permission('marks.manage') and recorded_by = auth.uid());
create policy "marks: update" on marks for update
  using (has_permission('marks.manage'))
  with check (has_permission('marks.manage'));

-- ---------- Audit logs (insert-only, Admin-readable) ----------

create policy "audit_logs: admin reads" on audit_logs for select
  using (has_permission('audit_logs.view'));
create policy "audit_logs: self-attributed insert" on audit_logs for insert
  with check (actor_id = auth.uid());
-- No update or delete policy exists for audit_logs — the table is permanently
-- append-only; even an Admin cannot edit or remove a row through the API.
