// ==========================================================
// Supabase project configuration
//
// Replace these two values with your own project's details
// (Supabase dashboard -> Project Settings -> API).
//
// The anon key is safe to ship in static/client-side files by
// design — it identifies the project, it does not grant access.
// Every table is locked down with Row Level Security (see
// sql/004_rls_policies.sql), so the anon key can only ever do
// what a signed-in user's role permits. Never put the
// "service_role" key anywhere in this folder.
// ==========================================================

const SUPABASE_URL = "https://kotdagsmacmjbpebmeqg.supabase.co"; // e.g. https://xxxxxxxx.supabase.co
const SUPABASE_ANON_KEY = "sb_publishable_e26J_lOLjbUIqnjOMfDV7A_mVAbCYZX";

// Loaded globally by the Supabase CDN script tag included on every page,
// before this file.
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
