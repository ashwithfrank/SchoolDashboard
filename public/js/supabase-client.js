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
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdGRhZ3NtYWNtamJwZWJtZXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzIyNTUsImV4cCI6MjEwNTI0ODI1NX0.uXldr1-VD4l-jxT2P2DOKHX6nvmZAjlI0yw9ChDQ-JM";

// Loaded globally by the Supabase CDN script tag included on every page,
// before this file.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
