# School Staff Management Dashboard — Phase 1

Static HTML/CSS/JS frontend + Supabase (Postgres/Auth/RLS) backend. No build step,
no framework, no bundler — every file in `public/` can be opened by a browser or
dropped onto any static host as-is.

This is **Phase 1** of the phased plan: architecture, database schema,
authentication, roles/permissions, and a basic dashboard shell. Students,
fees, transport, academics, and reports are placeholder pages (they say so
on screen) — those are Phases 2–6.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Once it's up, open **Project Settings → API** and note down:
   - **Project URL**
   - **anon public** key

Don't use the `service_role` key anywhere in this project — it's never needed
here, and it must never go into a static/client-side file.

## 2. Run the database migrations

Open **SQL Editor** in the Supabase dashboard and run these files **in order**,
each as its own run:

1. `sql/001_extensions_and_types.sql`
2. `sql/002_tables.sql`
3. `sql/003_views.sql`
4. `sql/004_rls_policies.sql`
5. `sql/005_seed.sql`

If any script errors, fix the cause and re-run just that script — they're
written to be safe to re-run individually once the error is resolved (though
not safe to run twice successfully, since they create tables/rows).

## 3. Create your first Admin login

There's no sign-up screen by design (staff accounts are created by an Admin,
per your requirements) — so the very first Admin has to be created manually,
once:

1. In Supabase: **Authentication → Users → Add user**. Create an account with
   your email and a password.
2. Copy that user's UUID from the users list.
3. In the **SQL Editor**, run (replacing the two placeholders):

   ```sql
   insert into profiles (id, full_name, role_id, is_active)
   values (
     '<paste the auth user UUID here>',
     'Your Name',
     (select id from roles where name = 'admin'),
     true
   );
   ```

You can now log in with that email/password once the site is running.

## 4. Configure the frontend

Open `public/js/supabase-client.js` and replace the two placeholder values:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

The anon key is safe to ship in a static file — it identifies the project,
it doesn't grant access by itself. Every table has Row Level Security, so the
anon key can only ever do what the signed-in user's role permits (see
`sql/004_rls_policies.sql`).

## 5. Run it locally

Any static file server works, e.g. from the `public/` folder:

```bash
cd public
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` will *not* work — the browser blocks the module-less fetch calls
Supabase's client makes over `file://`; you need an actual `http://` server,
even a local one.)

## 6. Host it

Because this is plain static files, any of these work with zero
configuration beyond "point it at the `public/` folder":

- **Netlify** — drag-and-drop the `public/` folder onto app.netlify.com/drop
- **Vercel** — `vercel deploy` from inside `public/` (or import the repo and set the root directory to `public`)
- **GitHub Pages** — push `public/`'s contents to a `gh-pages` branch (or the repo root, with Pages pointed at it)
- **Any web host / your school's own server** — it's just files; upload `public/` over FTP/SFTP if that's easier

No environment variables, no server process, no `.env` file to manage — the
only configuration is the two values in `supabase-client.js`.

---

## What to test right now

Since this is the Phase 1 shell, here's what's actually functional today:

- [ ] Visiting the site with no session redirects to `login.html`
- [ ] Logging in with the Admin account you bootstrapped works and lands on `dashboard.html`
- [ ] The sidebar shows **every** nav item for the Admin account (Students, Employees, Buses, Fee Collection, Academics, Reports, Audit Logs, Settings)
- [ ] The dashboard's stat cards show real counts (Total Classes should read **12** — LKG, UKG, Class 1–10 — from the seed data; Students/Employees/Buses will read **0** until you add data in a later phase)
- [ ] "Academic Year" card says "Not set" (expected — no academic year has been created/marked current yet; that screen ships in Phase 2)
- [ ] Logging out returns you to the login page and a subsequent visit to `dashboard.html` bounces you back to login (session is actually gone)
- [ ] Create a second Supabase Auth user + a `profiles` row with `role_id` set to `office_staff` (via SQL, same pattern as step 3) and confirm: that login sees **only** Dashboard, Students, Buses, Fee Collection, Reports in the sidebar — no Employees, Academics, Audit Logs, or Settings
- [ ] Same test for a `teaching_staff` account: should see Dashboard, Students, Buses, Academics, Reports — no Employees, Fee Collection, Audit Logs, Settings
- [ ] Try querying a restricted table directly from the browser console while logged in as Teaching Staff, e.g. `supabase.from('fee_payments').select('*')` — it should come back **empty**, not because the frontend hid it, but because RLS refuses the row. That's the "enforced at the database, not just the UI" requirement working.

If any of those don't hold, that's exactly the kind of thing to flag back —
tell me what you saw vs. expected and I'll fix it.

---

## Project layout

```
sql/
  001_extensions_and_types.sql
  002_tables.sql
  003_views.sql
  004_rls_policies.sql
  005_seed.sql
public/
  index.html            -> redirects to login or dashboard based on session
  login.html
  dashboard.html         -> live stat cards
  students.html           -> Phase 2 placeholder
  employees.html          -> Phase 3 placeholder (Admin only)
  buses.html               -> Phase 3 placeholder
  fees.html                 -> Phase 4 placeholder (Admin + Office)
  academics.html            -> Phase 5 placeholder (Admin + Teaching)
  reports.html               -> Phase 6 placeholder
  audit-logs.html            -> Phase 7 placeholder (Admin only)
  settings.html               -> Admin only
  css/styles.css
  js/
    supabase-client.js    -> fill in your project URL + anon key here
    nav.js                -> session guard + role-filtered sidebar + logout
    login.js
    dashboard.js
```

## Notes on what's deliberately not built yet

- No student/employee/bus/fee/academic CRUD screens — Phases 2–6.
- No staff-account-management UI — Admin creates new logins via SQL for now
  (step 3 above); that screen is one of the first things worth building next,
  since it removes the only manual-SQL step in normal operation.
- No audit-log-writing triggers yet — the table and its RLS exist and are
  locked down, but nothing populates it yet (Phase 7).
- No bulk promotion — the schema is shaped for it (see the architecture doc),
  but the workflow itself is a later phase.
