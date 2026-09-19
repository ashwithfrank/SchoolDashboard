-- ==========================================================
-- 005: Seed data
-- Run after 004_rls_policies.sql.
-- Seeds roles, permissions, the role/permission matrix, and the
-- fixed class list (LKG, UKG, Class 1-10). Does NOT create any
-- academic year, section, or user — see bottom of this file for
-- how to bootstrap your first Admin login.
-- ==========================================================

-- ---------- Roles (exactly three, per the confirmed requirements) ----------

insert into roles (name, description) values
  ('admin', 'Full system access'),
  ('office_staff', 'Student profiles, fees, transport, fee reports'),
  ('teaching_staff', 'Student profiles, subjects, exams, marks, academic reports');

-- ---------- Permissions ----------

insert into permissions (code, description) values
  ('students.manage',        'Create students, change enrollment/status, promote students'),
  ('students.edit',          'Edit a student''s identity/profile fields'),
  ('classes_sections.manage','Manage classes, sections, and section coordinators'),
  ('employees.manage',       'Manage employee records'),
  ('buses.manage',           'Manage the bus fleet'),
  ('academic_fees.manage',   'Manage fee structures and student fee assignments/discounts'),
  ('transport.manage',       'Manage per-student transport assignments and bus fees'),
  ('fee_payments.record',    'Record fee payments'),
  ('fee_reports.view',       'View fee and payment reports'),
  ('subjects.manage',        'Manage the subject catalog and class-subject mapping'),
  ('exams.manage',           'Manage exams and per-exam min/max marks'),
  ('marks.manage',           'Enter and edit student marks'),
  ('academic_reports.view',  'View academic/marks reports'),
  ('promotions.run',         'Promote students to the next academic year'),
  ('academic_years.manage',  'Manage academic years'),
  ('staff_accounts.manage',  'Manage staff login accounts, roles, and permissions'),
  ('audit_logs.view',        'View the audit log');

-- ---------- Role -> permission matrix ----------

-- Admin: every permission.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.name = 'admin';

-- Office Staff.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.code in (
    'students.edit',
    'academic_fees.manage',
    'transport.manage',
    'fee_payments.record',
    'fee_reports.view'
  )
where r.name = 'office_staff';

-- Teaching Staff.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.code in (
    'students.edit',
    'subjects.manage',
    'exams.manage',
    'marks.manage',
    'academic_reports.view'
  )
where r.name = 'teaching_staff';

-- ---------- Fixed class list ----------

insert into classes (name, sort_order) values
  ('LKG', 0),
  ('UKG', 1),
  ('Class 1', 2),
  ('Class 2', 3),
  ('Class 3', 4),
  ('Class 4', 5),
  ('Class 5', 6),
  ('Class 6', 7),
  ('Class 7', 8),
  ('Class 8', 9),
  ('Class 9', 10),
  ('Class 10', 11);

-- ==========================================================
-- Bootstrapping your first Admin login (do this once, manually):
--
-- 1. In the Supabase dashboard: Authentication -> Users -> Add user.
--    Create yourself an account with an email + password.
-- 2. Copy that user's UUID from the Users list.
-- 3. Run the following in the SQL editor, replacing the two values:
--
--    insert into profiles (id, full_name, role_id, is_active)
--    values (
--      '<paste the auth user UUID here>',
--      'Your Name',
--      (select id from roles where name = 'admin'),
--      true
--    );
--
-- This is the only manual step required — everything after that
-- (creating further staff accounts) can be done through the app
-- once the Settings > Staff Accounts screen is built in a later phase.
-- ==========================================================
