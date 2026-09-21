-- ==========================================================
-- 009: Performance review fix
-- Run after 008_audit_log_triggers.sql.
--
-- fee_payments already had an index on (student_id,
-- academic_year_id) — great for "this student's payments," which
-- is every query up through Phase 5. Phase 6's Reports page added
-- a different access pattern: "every payment for this year,
-- across all ~800 students" (student-fee, class-fee, and bus-fee
-- reports all do this). A composite index led by student_id
-- doesn't serve a query that filters on academic_year_id alone,
-- so at real enrollment scale that scan would get slow. This adds
-- the missing index.
-- ==========================================================

create index idx_fee_payments_year on fee_payments(academic_year_id);
