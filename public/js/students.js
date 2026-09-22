// ==========================================================
// Students: class grid -> sections -> student list, plus a
// global search box that short-circuits straight to a flat
// results list regardless of where you are in the drill-down.
// ==========================================================

let CAN_ADD_STUDENTS = false;
let CURRENT_YEAR = null; // { id, label } or null

(async () => {
  const { permissionCodes } = await initShell();
  CAN_ADD_STUDENTS = permissionCodes.has("students.manage");

  document.getElementById("page-title").textContent = "Students";

  const { data: year } = await supabaseClient
    .from("academic_years")
    .select("id, label")
    .eq("is_current", true)
    .maybeSingle();
  CURRENT_YEAR = year || null;

  wireSearchBox();
  await render();
})();

function wireSearchBox() {
  const form = document.getElementById("search-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("search-input").value.trim();
    const url = new URL(window.location.href);
    if (q) {
      url.searchParams.set("q", q);
    } else {
      url.searchParams.delete("q");
    }
    url.searchParams.delete("class");
    url.searchParams.delete("section");
    window.location.href = url.toString();
  });
}

async function render() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const classId = params.get("class");
  const sectionId = params.get("section");

  document.getElementById("search-input").value = q || "";

  if (!CURRENT_YEAR) {
    document.getElementById("students-body").innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">📅</div>
        <h2>No current academic year set</h2>
        <p>An administrator needs to set the current academic year in Settings before students can be browsed by class.</p>
      </div>
    `;
    document.getElementById("breadcrumb").innerHTML = "";
    return;
  }

  if (q) {
    await renderSearchResults(q);
  } else if (classId && sectionId) {
    await renderStudentList(classId, sectionId);
  } else if (classId) {
    await renderSections(classId);
  } else {
    await renderClassGrid();
  }
}

function setBreadcrumb(parts) {
  const html = parts
    .map((p, i) => {
      const isLast = i === parts.length - 1;
      if (isLast) return `<span class="current">${escapeHtml(p.label)}</span>`;
      return `<a href="${p.href}">${escapeHtml(p.label)}</a><span class="sep">/</span>`;
    })
    .join(" ");
  document.getElementById("breadcrumb").innerHTML = html;
}

// ---------- Level 1: class grid ----------

async function renderClassGrid() {
  setBreadcrumb([{ label: "All Classes", href: "students.html" }]);

  const [classesRes, enrollRes] = await Promise.all([
    supabaseClient.from("classes").select("id, name, sort_order").order("sort_order"),
    supabaseClient
      .from("student_academic_records")
      .select("class_id")
      .eq("academic_year_id", CURRENT_YEAR.id)
      .eq("enrollment_status", "active"),
  ]);

  const body = document.getElementById("students-body");

  if (classesRes.error) {
    body.innerHTML = `<div class="loading-row">Couldn't load classes.</div>`;
    return;
  }

  const countByClass = {};
  (enrollRes.data || []).forEach((r) => {
    countByClass[r.class_id] = (countByClass[r.class_id] || 0) + 1;
  });

  body.innerHTML = `
    <div class="tile-grid">
      ${classesRes.data
        .map(
          (c) => `
            <a class="tile-card" href="students.html?class=${c.id}">
              <div class="tile-title">${escapeHtml(c.name)}</div>
              <div class="tile-sub">${countByClass[c.id] || 0} student${countByClass[c.id] === 1 ? "" : "s"}</div>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

// ---------- Level 2: sections within a class ----------

async function renderSections(classId) {
  const { data: cls } = await supabaseClient.from("classes").select("id, name").eq("id", classId).maybeSingle();

  if (!cls) {
    document.getElementById("students-body").innerHTML = `<div class="loading-row">Class not found.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "All Classes", href: "students.html" },
    { label: cls.name, href: `students.html?class=${classId}` },
  ]);

  const [sectionsRes, enrollRes] = await Promise.all([
    supabaseClient
      .from("sections")
      .select("id, name, is_active")
      .eq("class_id", classId)
      .eq("is_active", true)
      .order("sort_order"),
    supabaseClient
      .from("student_academic_records")
      .select("section_id")
      .eq("academic_year_id", CURRENT_YEAR.id)
      .eq("class_id", classId)
      .eq("enrollment_status", "active"),
  ]);

  const body = document.getElementById("students-body");

  if (sectionsRes.error) {
    body.innerHTML = `<div class="loading-row">Couldn't load sections.</div>`;
    return;
  }

  if (!sectionsRes.data.length) {
    body.innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">🏫</div>
        <h2>No sections yet for ${escapeHtml(cls.name)}</h2>
        <p>${CAN_ADD_STUDENTS ? `Add one from <a href="settings.html">Settings</a> first.` : `Ask an administrator to add one in Settings.`}</p>
      </div>
    `;
    return;
  }

  const countBySection = {};
  (enrollRes.data || []).forEach((r) => {
    countBySection[r.section_id] = (countBySection[r.section_id] || 0) + 1;
  });

  body.innerHTML = `
    <div class="tile-grid">
      ${sectionsRes.data
        .map(
          (s) => `
            <a class="tile-card" href="students.html?class=${classId}&section=${s.id}">
              <div class="tile-title">Section ${escapeHtml(s.name)}</div>
              <div class="tile-sub">${countBySection[s.id] || 0} student${countBySection[s.id] === 1 ? "" : "s"}</div>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

// ---------- Level 3: student list for a section ----------

async function renderStudentList(classId, sectionId) {
  const [{ data: cls }, { data: sec }] = await Promise.all([
    supabaseClient.from("classes").select("id, name").eq("id", classId).maybeSingle(),
    supabaseClient.from("sections").select("id, name").eq("id", sectionId).maybeSingle(),
  ]);

  if (!cls || !sec) {
    document.getElementById("students-body").innerHTML = `<div class="loading-row">Not found.</div>`;
    return;
  }

  setBreadcrumb([
    { label: "All Classes", href: "students.html" },
    { label: cls.name, href: `students.html?class=${classId}` },
    { label: `Section ${sec.name}`, href: `students.html?class=${classId}&section=${sectionId}` },
  ]);

  const { data: rows, error } = await supabaseClient
    .from("student_academic_records")
    .select("roll_number, enrollment_status, students ( id, full_name, sats_number, gender, status )")
    .eq("academic_year_id", CURRENT_YEAR.id)
    .eq("class_id", classId)
    .eq("section_id", sectionId)
    .order("roll_number", { ascending: true, nullsFirst: false });

  const body = document.getElementById("students-body");

  if (error) {
    body.innerHTML = `<div class="loading-row">Couldn't load students.</div>`;
    return;
  }

  const addButton = CAN_ADD_STUDENTS
    ? `<a class="btn" href="student-form.html?class=${classId}&section=${sectionId}">+ Add Student</a>`
    : "";

  if (!rows.length) {
    body.innerHTML = `
      <div class="toolbar"><div></div>${addButton}</div>
      <div class="empty-state card">
        <div class="empty-icon">🎓</div>
        <h2>No students in this section yet</h2>
        <p>${CAN_ADD_STUDENTS ? "Add the first one above." : "Ask an administrator to enroll students here."}</p>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div class="toolbar"><div></div>${addButton}</div>
    <div class="card">
      <table>
        <thead><tr><th>Roll No.</th><th>Name</th><th>SATS Number</th><th>Gender</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `
                <tr>
                  <td>${r.roll_number ? escapeHtml(r.roll_number) : "—"}</td>
                  <td><a href="student-profile.html?id=${r.students.id}">${escapeHtml(r.students.full_name)}</a></td>
                  <td>${escapeHtml(r.students.sats_number)}</td>
                  <td>${r.students.gender ? escapeHtml(r.students.gender) : "—"}</td>
                  <td>${statusBadge(r.students.status)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Global search ----------

async function renderSearchResults(q) {
  setBreadcrumb([
    { label: "All Classes", href: "students.html" },
    { label: `Search: "${q}"`, href: "#" },
  ]);

  // Commas and parentheses are structural characters in PostgREST's
  // .or() filter syntax (comma separates conditions, parens group them) —
  // strip them from user-typed search text so a name like "Sharma, R."
  // or "Kumar (Jr.)" can't corrupt the filter instead of just matching it.
  const safeQ = sanitizeForOrFilter(q);
  const like = `%${safeQ}%`;
  const { data: rows, error } = await supabaseClient
    .from("students")
    .select("id, full_name, sats_number, admission_number, father_name, mother_name, contact_number, status")
    .or(
      `full_name.ilike.${like},sats_number.ilike.${like},admission_number.ilike.${like},father_name.ilike.${like},mother_name.ilike.${like},contact_number.ilike.${like}`
    )
    .order("full_name")
    .limit(100);

  const body = document.getElementById("students-body");

  if (error) {
    body.innerHTML = `<div class="loading-row">Search failed: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!rows.length) {
    body.innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">🔍</div>
        <h2>No matches for "${escapeHtml(q)}"</h2>
        <p>Try a different name, SATS number, admission number, parent name, or contact number.</p>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>SATS Number</th><th>Admission No.</th><th>Parents</th><th>Contact</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (s) => `
                <tr>
                  <td><a href="student-profile.html?id=${s.id}">${escapeHtml(s.full_name)}</a></td>
                  <td>${escapeHtml(s.sats_number)}</td>
                  <td>${s.admission_number ? escapeHtml(s.admission_number) : "—"}</td>
                  <td>${escapeHtml([s.father_name, s.mother_name].filter(Boolean).join(" / ") || "—")}</td>
                  <td>${s.contact_number ? escapeHtml(s.contact_number) : "—"}</td>
                  <td>${statusBadge(s.status)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function statusBadge(status) {
  const map = {
    active: "badge-success",
    alumni: "badge-neutral",
    transferred_out: "badge-warning",
    inactive: "badge-danger",
  };
  return `<span class="badge ${map[status] || "badge-neutral"}">${escapeHtml(status)}</span>`;
}

function sanitizeForOrFilter(str) {
  return str.replace(/[,()]/g, " ").trim();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
