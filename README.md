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

If you're picking this up after Phase 1 already worked, there's one more
migration to run before Phase 2 will work:

6. `sql/006_academic_year_functions.sql`

Phase 3 (Employees + Buses) needs no new migrations — it uses the
`employees`, `buses`, and `student_transport_assignments` tables and RLS
policies that were already part of Phase 1.

Phase 4 (Fee Structures + Fee Collection) needs one small RLS fix:

7. `sql/007_broaden_profile_read.sql` — widens who can read the `profiles`
   table (see the comment at the top of that file for why: payment history
   shows who recorded each payment, which needs every staff member to be
   able to read *names* off `profiles`, not just their own row).

Phase 5 (Academics: subjects, exams, marks) needs no new migrations — it
uses the `subjects`, `class_subjects`, `exams`, `exam_subjects`, and `marks`
tables and RLS policies that were already part of Phase 1.

---

## What to test right now (Phase 1 + 2 + 3 + 4 + 5)

**Phase 1 — auth, roles, dashboard shell:**

- [ ] Visiting the site with no session redirects to `login.html`
- [ ] Logging in with the Admin account you bootstrapped works and lands on `dashboard.html`
- [ ] The sidebar shows **every** nav item for the Admin account
- [ ] Logging out returns you to the login page and a subsequent visit to `dashboard.html` bounces you back to login
- [ ] Create a second Supabase Auth user + a `profiles` row with `role_id` set to `office_staff` (same pattern as step 3 above) and confirm that login sees **only** Dashboard, Students, Buses, Fee Collection, Reports in the sidebar
- [ ] Same test for a `teaching_staff` account: Dashboard, Students, Buses, Academics, Reports only
- [ ] While logged in as Teaching Staff, open the browser console and run `supabaseClient.from('fee_payments').select('*')` — it should come back **empty**, because RLS refuses the row, not because the UI hid a button

**Phase 2 — academic years, classes/sections, students:**

- [ ] In **Settings**, add an academic year (e.g. `2026-27`) and click "Set as current" — the Dashboard's "Academic Year" card should update immediately, and "Total Classes" already reads **12** from the seed data
- [ ] Still in Settings, add a section (e.g. "A") to a couple of classes
- [ ] Go to **Students** — you should see all 12 classes as tiles, each showing a student count (0 for now)
- [ ] Click into a class with a section you added → you should see that section as a tile
- [ ] Click **+ Add Student** (only visible for Admin), fill in the form, submit — you should land on that student's profile page
- [ ] Go back to Students → the class and section tiles should now show the updated count, and the student list inside that section should show the new student
- [ ] On the student's profile, click **Edit** on the Basic tab, change a field, save — it should update immediately. Try this while logged in as Office Staff and Teaching Staff too (both should be able to edit, per the confirmed role matrix) — but the **Status** dropdown should only appear for Admin
- [ ] Use the search bar on the Students page to search by partial name, SATS number, or parent name — confirm it finds the student regardless of which class/section you're currently browsing
- [ ] Try adding a student while logged in as Office Staff or Teaching Staff (either by hiding/showing the button via devtools, or navigating straight to `student-form.html`) — it should show "Not authorized" and, if you strip that check out just to test, the actual `insert` should still fail server-side (RLS)
- [ ] Try setting two academic years as "current" back to back — confirm only one ever shows the "Current" badge at a time

**Phase 3 — employees, buses, transport:**

- [ ] In **Employees**, add a driver (type = Driver) and a teacher (type = Teaching) — both should appear in the list with the right type badge
- [ ] Filter the employee list by type and by active/inactive, and try the search box against a name/code/contact number
- [ ] In **Buses**, add a bus and assign the driver you just created — the bus list should show the driver's name
- [ ] Set a bus's insurance or FC expiry date to a past date, another to within 30 days, and a third more than 30 days out — confirm the badges read **Expired** (red), **Expires** (amber), and **Valid until** (green) respectively
- [ ] Click into a bus's detail page — you should see its info plus an (empty, for now) assigned-students roster
- [ ] Open a student's profile → **Transport** tab → assign them to the bus you created, with a location, distance, and a bus fee — save it
- [ ] Go back to that bus's detail page → the student should now appear in the roster with the location/distance/fee you entered
- [ ] Add a second student to the **same bus** with a **different** bus fee — confirm both students show their own distinct fee on the bus roster (this is the "per-student bus fee, not per-bus" requirement — the whole reason `student_transport_assignments` exists as its own table)
- [ ] On the first student's Transport tab, click **Edit**, change the fee, save — confirm it updates
- [ ] Click **Remove from bus** on a student's Transport tab — confirm they disappear from that bus's roster, and that the Transport tab now shows the "assign" form again (not stuck showing stale data)
- [ ] Log in as Teaching Staff and open a student's Transport tab — it should say transport details aren't visible to that role, rather than showing (or erroring on) any fee data
- [ ] Log in as Office Staff and confirm they **can** see and edit Transport (per the confirmed matrix), but that Employees and Buses pages don't show "+ Add" controls for them (view-only) and the sidebar doesn't list Employees for that role at all

**Phase 4 — fee structures, fee collection:**

- [ ] In **Fee Collection**, set an academic fee for a couple of classes (e.g. Class 5 → ₹20,000) — confirm it saves and shows in the table
- [ ] Open a student in one of those classes → **Fees** tab → it should say fees aren't set up yet and offer a "Set up fees" form, pre-filled with that class's academic fee
- [ ] Submit that form — the tab should now show the full breakdown (Academic fee / Bus fee / Discount / Total / Paid / Pending), with **Paid = ₹0** since nothing's been recorded yet
- [ ] If that student already has a bus assignment from Phase 3 testing, confirm the **Bus fee** shown here matches what you set on their Transport tab exactly (this is the "computed from the transport table, never duplicated" design working)
- [ ] Use **Record a Payment** to log a partial payment (e.g. ₹5,000 of a ₹20,000 fee) — confirm Paid/Pending update immediately and the payment appears in Payment History with today's date and your name under "Recorded By"
- [ ] Record a second payment from a **different** staff account (Admin and Office both have `fee_payments.record`) — confirm the first account can still see the second account's name under "Recorded By" (this is what migration 007 fixes — without it, that column would be blank for anyone else's payments)
- [ ] Click **Edit discount** on a student's Fees tab, set a discount, save — confirm Total and Pending recalculate immediately, and that the discount amount is never something you can set by editing "Total" directly (there is no editable Total field — it's always derived)
- [ ] Go back to **Fee Collection** → the "Collection by Class" table and the top summary cards should reflect the payment(s) you just recorded
- [ ] Log in as Teaching Staff and open a student's Fees tab — it should say fee details aren't visible to that role
- [ ] Try to record a payment with a negative or zero amount — the database has a `check (amount > 0)` constraint, so this should fail even if you bypass the form (e.g. via the browser console)

**Phase 5 — subjects, exams, marks:**

- [ ] In **Academics**, add a couple of subjects (e.g. Mathematics, English)
- [ ] Under "Subjects by Class", check a couple of subjects for a class (e.g. Class 5 → Mathematics, English) and save
- [ ] Add an exam for that class (e.g. "Mid Term") with a date
- [ ] Open the exam → **Subjects & Thresholds** → add Mathematics with max 100 / pass 35
- [ ] Under **Enter Marks**, pick Mathematics from the dropdown — you should see every student currently enrolled in that class for the current year
- [ ] Type a score for a couple of students (try one that should pass, e.g. 78, and one that should fail, e.g. 29) — confirm the Result column updates **live as you type**, before you've even saved
- [ ] Click **Save Marks** — reload the page, re-select Mathematics, and confirm the scores you entered are still there
- [ ] Open one of those students' profile → **Marks** tab — confirm the same exam/subject/score appears there, with percentage and PASS/FAIL matching what the exam page showed (this is the same `student_marks_summary` view in both places — one source of truth)
- [ ] Try setting a subject's pass marks higher than its max marks when adding a threshold — it should be rejected with a clear message before it ever reaches the database
- [ ] Log in as Office Staff and confirm Academics isn't in their sidebar at all, and that a student's Marks tab says marks aren't visible to that role
- [ ] As Teaching Staff, confirm you *can* do everything above (subjects, exams, thresholds, marks) — the matrix gives Teaching Staff the same academic permissions as Admin, just not the fee/employee/bus ones

If any of those don't hold, tell me what you saw vs. expected and I'll fix it.

---

## Project layout

```
sql/
  001_extensions_and_types.sql
  002_tables.sql
  003_views.sql
  004_rls_policies.sql
  005_seed.sql
  006_academic_year_functions.sql
  007_broaden_profile_read.sql
public/
  index.html                -> redirects to login or dashboard based on session
  login.html
  dashboard.html             -> live stat cards
  students.html                -> class grid -> sections -> student list, + global search
  student-form.html              -> Add Student (Admin only)
  student-profile.html             -> Basic, Academic, Transport, Fees, and Marks are all functional
  employees.html                     -> list + filters (Admin adds/edits)
  employee-form.html                   -> Add/Edit Employee (Admin only)
  buses.html                             -> fleet list with insurance/FC expiry badges
  bus-form.html                            -> Add/Edit Bus (Admin only)
  bus-detail.html                            -> bus info + assigned-students roster (Admin + Office see the roster)
  fees.html                                    -> summary + class-wise collection + fee structures + student search
  academics.html                                 -> subjects catalog, class-subject assignment, exams list
  exam-detail.html                                 -> per-exam thresholds (max/min marks) + marks entry grid
  reports.html                                       -> Phase 6 placeholder
  audit-logs.html                                      -> Phase 7 placeholder (Admin only)
  settings.html                                          -> Academic years + Classes/Sections management (Admin only)
  css/styles.css
  js/
    supabase-client.js    -> fill in your project URL + anon key here
    nav.js                -> session guard + role-filtered sidebar + logout
    login.js
    dashboard.js
    students.js            -> class/section browsing + search
    student-form.js
    student-profile.js      -> Basic/Academic/Transport/Fees/Marks tab logic
    settings.js            -> academic years + classes/sections
    employees.js            -> employee list + filters
    employee-form.js
    buses.js                -> bus list + expiry badge logic
    bus-form.js
    bus-detail.js            -> bus info + roster (permission-gated)
    fees.js                   -> fee summary, class breakdown, fee structures, student search
    academics.js               -> subjects, class-subject assignment, exams list
    exam-detail.js               -> thresholds + marks entry grid, live percentage/pass-fail
```

## Notes on what's deliberately not built yet

- No reports/export screens yet — Phase 6 (print/export, more report types
  beyond the class-wise fee breakdown already on the Fees page).
- No staff-account-management UI — Admin creates new logins via SQL for now
  (step 3 above); that screen is one of the first things worth building next,
  since it removes the only manual-SQL step in normal operation.
- No audit-log-writing triggers yet — the table and its RLS exist and are
  locked down, but nothing populates it yet (Phase 7).
- No bulk promotion, and no way to move a student to a new year/class from the
  UI yet — the schema is shaped for it (see the architecture doc: every
  enrollment is its own row per student per year), but the promotion workflow
  itself is a later phase. Right now a student's academic history can only
  grow via the initial enrollment created when they're added.
- Section coordinators (`section_coordinators` table) have no UI yet — the
  schema and RLS are in place, but assigning a coordinator to a section isn't
  exposed anywhere yet. Worth adding to Settings alongside sections if you
  want it sooner rather than later.
- Removing a student from a bus deletes their `student_transport_assignments`
  row outright (not a soft-deactivate) — matching the "no row = no bus"
  design from the architecture doc, and it also means they can be reassigned
  to a different bus the same year without hitting a uniqueness conflict.
- Removing a subject from an exam's thresholds (`exam_subjects`) cascades to
  delete any marks already recorded for that subject on that exam — the
  confirmation dialog says so before you click through.
