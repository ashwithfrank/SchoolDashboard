-- ==========================================================
-- 002: Tables
-- Run after 001_extensions_and_types.sql
-- ==========================================================

-- ---------- Roles & permissions ----------

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 'admin' | 'office_staff' | 'teaching_staff'
  description text,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- e.g. 'students.create', 'fees.record_payment'
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------- Profiles (extends auth.users) ----------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role_id uuid not null references roles(id),
  employee_id uuid,                   -- FK added after employees exists (see below)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role_id on profiles(role_id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------- Academic years ----------

create table academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,         -- e.g. '2026-27'
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

-- Exactly one academic year may be current at a time.
create unique index uq_academic_years_one_current
  on academic_years (is_current)
  where is_current;

-- ---------- Classes & sections ----------

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 'LKG','UKG','Class 1' ... 'Class 10'
  sort_order int not null,
  created_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete restrict,
  name text not null,                 -- 'A','B','C'
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (class_id, name),
  unique (id, class_id)               -- lets other tables FK on (section_id, class_id)
);

create index idx_sections_class_id on sections(class_id);

-- ---------- Employees ----------

create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  employee_type employee_type not null,
  designation text,
  contact_number text,
  email text,
  address text,
  joining_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_employees_type on employees(employee_type);
create index idx_employees_active on employees(is_active);

create trigger trg_employees_updated_at
  before update on employees
  for each row execute function set_updated_at();

-- Now that employees exists, link profiles.employee_id
alter table profiles
  add constraint fk_profiles_employee
  foreign key (employee_id) references employees(id) on delete set null;

-- ---------- Section coordinators (year-aware) ----------

create table section_coordinators (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (section_id, academic_year_id)
);

create index idx_section_coordinators_year on section_coordinators(academic_year_id);

-- ---------- Buses ----------

create table buses (
  id uuid primary key default gen_random_uuid(),
  bus_number text not null unique,
  driver_id uuid references employees(id) on delete set null,
  insurance_expiry_date date,
  fc_expiry_date date,
  capacity int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_buses_active on buses(is_active);

create trigger trg_buses_updated_at
  before update on buses
  for each row execute function set_updated_at();

-- ---------- Students ----------

create table students (
  id uuid primary key default gen_random_uuid(),
  sats_number text not null unique,
  admission_number text unique,
  full_name text not null,
  father_name text,
  mother_name text,
  contact_number text,
  gender gender_type,
  date_of_birth date,
  status student_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_students_sats_number on students(sats_number);
create index idx_students_admission_number on students(admission_number);
create index idx_students_full_name_trgm on students using gin (full_name gin_trgm_ops);
create index idx_students_status on students(status);

create trigger trg_students_updated_at
  before update on students
  for each row execute function set_updated_at();

-- ---------- Student academic records (the yearly hub) ----------

create table student_academic_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  class_id uuid not null references classes(id) on delete restrict,
  section_id uuid not null references sections(id) on delete restrict,
  roll_number text,
  enrollment_status enrollment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id),
  foreign key (section_id, class_id) references sections(id, class_id)
);

create index idx_sar_year_class_section on student_academic_records(academic_year_id, class_id, section_id);
create index idx_sar_student on student_academic_records(student_id);

create trigger trg_sar_updated_at
  before update on student_academic_records
  for each row execute function set_updated_at();

-- ---------- Student transport assignments (per-student bus fee) ----------

create table student_transport_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  bus_id uuid not null references buses(id) on delete restrict,
  location text,
  distance_km numeric(6,2),
  bus_fee numeric(10,2) not null check (bus_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create index idx_sta_bus_id on student_transport_assignments(bus_id);
create index idx_sta_year on student_transport_assignments(academic_year_id);

create trigger trg_sta_updated_at
  before update on student_transport_assignments
  for each row execute function set_updated_at();

-- ---------- Subjects ----------

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, academic_year_id, subject_id)
);

create index idx_class_subjects_year_class on class_subjects(academic_year_id, class_id);

-- ---------- Fee structures & assignments ----------

create table fee_structures (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  academic_fee numeric(10,2) not null check (academic_fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, class_id)
);

create trigger trg_fee_structures_updated_at
  before update on fee_structures
  for each row execute function set_updated_at();

create table student_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  fee_structure_id uuid not null references fee_structures(id) on delete restrict,
  academic_fee_applicable numeric(10,2) not null check (academic_fee_applicable >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create index idx_sfa_year on student_fee_assignments(academic_year_id);

create trigger trg_sfa_updated_at
  before update on student_fee_assignments
  for each row execute function set_updated_at();

-- ---------- Fee payments (append-only) ----------

create table fee_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  fee_type fee_type not null,
  amount numeric(10,2) not null check (amount > 0),
  payment_date date not null,
  notes text,
  recorded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_fee_payments_student_year on fee_payments(student_id, academic_year_id);
create index idx_fee_payments_date on fee_payments(payment_date);

-- ---------- Exams, exam_subjects, marks ----------

create table exams (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  exam_date date,
  created_at timestamptz not null default now(),
  unique (academic_year_id, class_id, name)
);

create index idx_exams_year_class on exams(academic_year_id, class_id);

create table exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  max_marks numeric(6,2) not null check (max_marks > 0),
  min_marks numeric(6,2) not null check (min_marks >= 0),
  created_at timestamptz not null default now(),
  unique (exam_id, subject_id),
  check (min_marks <= max_marks)
);

create table marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  exam_id uuid not null,
  subject_id uuid not null,
  scored_marks numeric(6,2) not null check (scored_marks >= 0),
  recorded_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, exam_id, subject_id),
  foreign key (exam_id, subject_id) references exam_subjects(exam_id, subject_id)
);

create index idx_marks_student on marks(student_id);

create trigger trg_marks_updated_at
  before update on marks
  for each row execute function set_updated_at();

-- exam_subjects needs a unique (exam_id, subject_id) for the marks composite FK above
-- (already declared via the unique() constraint on exam_subjects).

-- ---------- Audit logs (insert-only) ----------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_created_at on audit_logs(created_at);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
