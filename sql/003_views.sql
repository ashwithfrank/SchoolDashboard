-- ==========================================================
-- 003: Views
-- Derived data only — nothing here is a stored total.
-- Run after 002_tables.sql
-- ==========================================================

-- Per student/year: total fee, total paid, pending.
create or replace view student_fee_summary as
select
  sfa.student_id,
  sfa.academic_year_id,
  sfa.academic_fee_applicable,
  coalesce(sta.bus_fee, 0) as bus_fee_applicable,
  sfa.discount_amount,
  (sfa.academic_fee_applicable + coalesce(sta.bus_fee, 0) - sfa.discount_amount) as total_fee,
  coalesce(pay.total_paid, 0) as total_paid,
  (sfa.academic_fee_applicable + coalesce(sta.bus_fee, 0) - sfa.discount_amount)
    - coalesce(pay.total_paid, 0) as pending
from student_fee_assignments sfa
left join student_transport_assignments sta
  on sta.student_id = sfa.student_id
  and sta.academic_year_id = sfa.academic_year_id
  and sta.is_active
left join (
  select student_id, academic_year_id, sum(amount) as total_paid
  from fee_payments
  group by student_id, academic_year_id
) pay
  on pay.student_id = sfa.student_id
  and pay.academic_year_id = sfa.academic_year_id;

-- Per student/exam/subject: percentage and pass/fail, always derived.
create or replace view student_marks_summary as
select
  m.id as mark_id,
  m.student_id,
  m.exam_id,
  m.subject_id,
  m.scored_marks,
  es.max_marks,
  es.min_marks,
  round((m.scored_marks / es.max_marks) * 100, 2) as percentage,
  case when m.scored_marks >= es.min_marks then 'PASS' else 'FAIL' end as result
from marks m
join exam_subjects es
  on es.exam_id = m.exam_id and es.subject_id = m.subject_id;

-- Convenience: a student's current-year enrollment (class/section/coordinator),
-- used constantly by the dashboard and student profile.
create or replace view student_current_enrollment as
select
  sar.student_id,
  sar.academic_year_id,
  sar.class_id,
  c.name as class_name,
  sar.section_id,
  s.name as section_name,
  sar.roll_number,
  sar.enrollment_status
from student_academic_records sar
join classes c on c.id = sar.class_id
join sections s on s.id = sar.section_id
join academic_years ay on ay.id = sar.academic_year_id
where ay.is_current;
