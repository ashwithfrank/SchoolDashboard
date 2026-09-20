// ==========================================================
// Academics hub:
//  - subject catalog (global, add new subjects)
//  - which subjects apply to which class, for the current year
//  - exams for the current year, with a link into each exam's
//    subject thresholds + marks entry (exam-detail.html)
// Admin + Teaching Staff only, per the confirmed role matrix.
// ==========================================================

let CAN_MANAGE = false;
let CURRENT_YEAR = null;
let ALL_SUBJECTS = [];
let ALL_CLASSES = [];

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Academics";

  CAN_MANAGE =
    permissionCodes.has("subjects.manage") ||
    permissionCodes.has("exams.manage") ||
    permissionCodes.has("marks.manage") ||
    permissionCodes.has("academic_reports.view");

  if (!CAN_MANAGE) {
    document.getElementById("academics-content").innerHTML = `
      <div class="access-denied card">
        <h2>No academics access</h2>
        <p>Your role doesn't include subjects, exams, or marks. If you think this is wrong, ask an administrator.</p>
      </div>
    `;
    return;
  }

  const { data: year } = await supabaseClient.from("academic_years").select("id, label").eq("is_current", true).maybeSingle();
  CURRENT_YEAR = year || null;

  if (!CURRENT_YEAR) {
    document.getElementById("academics-content").innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">📅</div>
        <h2>No current academic year set</h2>
        <p>Set the current academic year in <a href="settings.html">Settings</a> first.</p>
      </div>
    `;
    return;
  }

  document.getElementById("academics-content").innerHTML = pageHtml();

  const canManageSubjects = permissionCodes.has("subjects.manage");
  const canManageExams = permissionCodes.has("exams.manage");

  await loadSubjects(canManageSubjects);
  await loadClassSubjects(canManageSubjects);
  await loadExams(canManageExams);
})();

function pageHtml() {
  return `
    <div class="card section-block">
      <h3>Subjects</h3>
      <p class="field-hint" style="margin-bottom:14px;">The subject catalog is shared across all classes and years.</p>
      <div id="subjects-error" class="form-error"></div>
      <div id="subjects-list"><div class="loading-row">Loading…</div></div>
    </div>

    <div class="card section-block">
      <h3>Subjects by Class — ${escapeHtml(CURRENT_YEAR.label)}</h3>
      <p class="field-hint" style="margin-bottom:14px;">Which subjects are taught in each class this year.</p>
      <div id="class-subjects-error" class="form-error"></div>
      <div id="class-subjects-list"><div class="loading-row">Loading…</div></div>
    </div>

    <div class="card section-block">
      <h3>Exams — ${escapeHtml(CURRENT_YEAR.label)}</h3>
      <div id="exams-error" class="form-error"></div>
      <table>
        <thead><tr><th>Name</th><th>Class</th><th>Date</th><th></th></tr></thead>
        <tbody id="exams-tbody"><tr><td colspan="4" class="loading-row">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
}

// ---------- Subjects ----------

async function loadSubjects(canManage) {
  const { data, error } = await supabaseClient.from("subjects").select("id, name").order("name");
  const container = document.getElementById("subjects-list");

  if (error) {
    container.innerHTML = `<p class="field-hint">Couldn't load subjects.</p>`;
    return;
  }

  ALL_SUBJECTS = data || [];

  const chips = ALL_SUBJECTS.length
    ? ALL_SUBJECTS.map((s) => `<span class="badge badge-neutral" style="margin:0 6px 6px 0;">${escapeHtml(s.name)}</span>`).join("")
    : `<span class="field-hint">No subjects yet.</span>`;

  container.innerHTML = `
    <div style="margin-bottom:14px;">${chips}</div>
    ${
      canManage
        ? `
      <form id="add-subject-form" class="inline-form-row" style="margin-bottom:0;">
        <div class="field"><input type="text" id="new-subject-name" placeholder="New subject name" required /></div>
        <button type="submit" class="btn btn-secondary">Add subject</button>
      </form>
    `
        : ""
    }
  `;

  if (canManage) {
    document.getElementById("add-subject-form").addEventListener("submit", onAddSubject);
  }
}

async function onAddSubject(event) {
  event.preventDefault();
  const errorBox = document.getElementById("subjects-error");
  errorBox.classList.remove("visible");

  const input = document.getElementById("new-subject-name");
  const name = input.value.trim();
  if (!name) return;

  const { error } = await supabaseClient.from("subjects").insert({ name });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  const canManage = document.getElementById("add-subject-form") != null;
  await loadSubjects(canManage);
  await loadClassSubjects(canManage);
}

// ---------- Class-subject assignment ----------

async function loadClassSubjects(canManage) {
  const [{ data: classes, error: classErr }, { data: mappings, error: mapErr }] = await Promise.all([
    supabaseClient.from("classes").select("id, name, sort_order").order("sort_order"),
    supabaseClient.from("class_subjects").select("id, class_id, subject_id").eq("academic_year_id", CURRENT_YEAR.id),
  ]);

  const container = document.getElementById("class-subjects-list");

  if (classErr || mapErr) {
    container.innerHTML = `<p class="field-hint">Couldn't load class-subject assignments.</p>`;
    return;
  }

  ALL_CLASSES = classes || [];

  const mappedByClass = {};
  (mappings || []).forEach((m) => {
    (mappedByClass[m.class_id] ||= new Set()).add(m.subject_id);
  });

  if (!ALL_SUBJECTS.length) {
    container.innerHTML = `<p class="field-hint">Add a subject above first.</p>`;
    return;
  }

  container.innerHTML = ALL_CLASSES.map((c) => {
    const assigned = mappedByClass[c.id] || new Set();
    const checkboxes = ALL_SUBJECTS.map(
      (s) => `
        <label style="display:inline-flex; align-items:center; gap:5px; margin:0 14px 8px 0; font-weight:400;">
          <input type="checkbox" value="${s.id}" ${assigned.has(s.id) ? "checked" : ""} ${canManage ? "" : "disabled"} style="width:auto;" />
          ${escapeHtml(s.name)}
        </label>
      `
    ).join("");

    return `
      <div style="padding:10px 0; border-bottom:1px solid var(--color-border);" data-class-subjects-row="${c.id}">
        <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(c.name)}</div>
        <div>${checkboxes}</div>
        ${canManage ? `<button class="text-btn" data-save-class-subjects="${c.id}" style="margin-top:4px;">Save</button>` : ""}
      </div>
    `;
  }).join("");

  if (!canManage) return;

  container.querySelectorAll("[data-save-class-subjects]").forEach((btn) => {
    btn.addEventListener("click", () => saveClassSubjects(btn.dataset.saveClassSubjects));
  });
}

async function saveClassSubjects(classId) {
  const errorBox = document.getElementById("class-subjects-error");
  errorBox.classList.remove("visible");

  const row = document.querySelector(`[data-class-subjects-row="${classId}"]`);
  const checked = Array.from(row.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);

  // Simplest correct approach: replace this class's mappings for the year wholesale.
  const { error: delError } = await supabaseClient
    .from("class_subjects")
    .delete()
    .eq("class_id", classId)
    .eq("academic_year_id", CURRENT_YEAR.id);

  if (delError) {
    errorBox.textContent = delError.message;
    errorBox.classList.add("visible");
    return;
  }

  if (checked.length) {
    const { error: insError } = await supabaseClient
      .from("class_subjects")
      .insert(checked.map((subjectId) => ({ class_id: classId, academic_year_id: CURRENT_YEAR.id, subject_id: subjectId })));

    if (insError) {
      errorBox.textContent = insError.message;
      errorBox.classList.add("visible");
      return;
    }
  }
}

// ---------- Exams ----------

async function loadExams(canManage) {
  const { data, error } = await supabaseClient
    .from("exams")
    .select("id, name, exam_date, classes ( name )")
    .eq("academic_year_id", CURRENT_YEAR.id)
    .order("exam_date", { ascending: true, nullsFirst: true });

  const tbody = document.getElementById("exams-tbody");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-row">Couldn't load exams.</td></tr>`;
    return;
  }

  const rowsHtml = data.length
    ? data
        .map(
          (e) => `
            <tr>
              <td><a href="exam-detail.html?id=${e.id}">${escapeHtml(e.name)}</a></td>
              <td>${escapeHtml(e.classes.name)}</td>
              <td>${e.exam_date ? escapeHtml(e.exam_date) : "—"}</td>
              <td><a href="exam-detail.html?id=${e.id}">Open →</a></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4" class="loading-row">No exams yet for ${escapeHtml(CURRENT_YEAR.label)}.</td></tr>`;

  tbody.innerHTML = rowsHtml;

  if (!canManage) return;

  // Append the add-exam form below the table, once.
  const existing = document.getElementById("add-exam-form");
  if (existing) return;

  const classOptions = ALL_CLASSES.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  document.querySelector("#exams-tbody").closest(".card").insertAdjacentHTML(
    "beforeend",
    `
      <form id="add-exam-form" class="inline-form-row" style="margin-top:16px; margin-bottom:0;">
        <div class="field">
          <input type="text" id="new-exam-name" placeholder="Exam name (e.g. Mid Term)" required />
        </div>
        <div class="field">
          <select id="new-exam-class" required><option value="">Class…</option>${classOptions}</select>
        </div>
        <div class="field">
          <input type="date" id="new-exam-date" />
        </div>
        <button type="submit" class="btn btn-secondary">Add exam</button>
      </form>
    `
  );

  document.getElementById("add-exam-form").addEventListener("submit", onAddExam);
}

async function onAddExam(event) {
  event.preventDefault();
  const errorBox = document.getElementById("exams-error");
  errorBox.classList.remove("visible");

  const name = document.getElementById("new-exam-name").value.trim();
  const classId = document.getElementById("new-exam-class").value;
  const examDate = document.getElementById("new-exam-date").value || null;

  const { error } = await supabaseClient
    .from("exams")
    .insert({ academic_year_id: CURRENT_YEAR.id, class_id: classId, name, exam_date: examDate });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  await loadExams(true);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
