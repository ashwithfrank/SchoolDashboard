-- ==========================================================
-- 006: Academic year helper function
-- Run after 005_seed.sql.
--
-- Switching the "current" academic year is two updates (unset the
-- old one, set the new one) that need to happen together — this
-- wraps them in one transaction instead of leaving that to two
-- separate calls from the browser.
-- ==========================================================

create or replace function public.set_current_academic_year(target_year_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission('academic_years.manage') then
    raise exception 'Not authorized to manage academic years.';
  end if;

  if not exists (select 1 from academic_years where id = target_year_id) then
    raise exception 'Academic year not found.';
  end if;

  update academic_years set is_current = false where is_current = true;
  update academic_years set is_current = true where id = target_year_id;
end;
$$;

grant execute on function public.set_current_academic_year(uuid) to authenticated;
