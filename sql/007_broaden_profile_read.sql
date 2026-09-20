-- ==========================================================
-- 007: Broaden profile read access
-- Run after 006_academic_year_functions.sql.
--
-- Phase 4 surfaced a gap: fee_payments.recorded_by references
-- profiles, and payment history shows "Recorded By" to any staff
-- member who can see the payment (Admin + Office). But the
-- original profiles policy only let someone read their own row
-- or an Admin read everyone's — so Office Staff viewing a payment
-- recorded by a *different* Office Staff member saw a blank name,
-- not because of a bug, but because RLS correctly refused that
-- profile row.
--
-- Fix: any active staff member can read the (non-sensitive) profile
-- directory — id, name, role — of their colleagues. This is a
-- staff directory, not account security data (no credentials live
-- here; Supabase Auth owns those separately), so this is a safe
-- widening. Mutating a profile is unchanged: still self (limited,
-- via the existing trigger) or Admin only.
-- ==========================================================

drop policy "profiles: read own or admin" on profiles;

create policy "profiles: any active staff can read" on profiles for select
  using (is_active_staff());
