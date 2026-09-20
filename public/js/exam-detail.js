// ==========================================================
// Exam detail:
//  - exam info (name, class, year, date)
//  - subjects & thresholds for this exam (exam_subjects: max/min
//    marks per subject, set once, not per student)
//  - marks entry: pick a configured subject, see every student
//    enrolled in that exam's class for the current year, enter
//    scored marks. Percentage/pass-fail are computed, never
//    entered — shown live from the max/min already configured.
// Admin + Teaching Staff only.
// ==========================================================

let EXAM_ID = null;
let EXAM_DATA = null;
let CAN_MANAGE_EXAMS = false;
let CAN_MANAGE_MARKS = false;
let CURRENT_USER_ID = null;
let SELECTED_SUBJECT_ID = null;

(async () => {
  const { permissionCodes, session } = await initShell();
  document.getElementById("page-title").textContent = "Exam Detail";
  CURRENT_USER_ID = session.user.id;

  CAN_MANAGE_EXAMS = permissionCodes.has("exams.manage");
  CAN_MANAGE_MARKS = permissionCodes.has("marks.manage");
  const canView = CAN_MANAGE_EXAMS || CAN_MANAGE_MARKS || permissionCodes.has("academic_reports.view");

  if (!canView) {
    document.getElementById("detail-area").innerHTML = `
      <div class="access-denied card">
        <h2>Not authorized</h2>
        <p>Your role doesn't include academics access.</p>
      </div>
    `;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  EXAM_ID = params.get("id");

  if (!EXAM_ID) {
    document.getElementById("detail-area").innerHTML = `<div class="loading-row">No exam specified.</div>`;
    return;
  }

  await loadExam();
  await loadThresholds();
})();

async function loadExam() {
  const { data, error } = await supabaseClient
    .from("exams")
    .select("id, name, exam_date, academic_year_id, class_id, classes ( name ), academic_years ( label )")
    .eq("id", EXAM_ID)
    .maybeSingle();

  if (error || !data) {
    document.getElementById("detail-area").innerHTML = `<div class="loading-row">Exam not found.</div>`;
    return;
  }

  EXAM_DATA = data;
  document.getElementById("exam-heading").textContent = data.name;
  document.getElementById("exam-info").innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Class</label><div class="field-static">${escapeHtml(data.classes.name)}</div></div>
      <div class="field"><label>Academic Year</label><div class="field-static">${escapeHtml(data.academic_years.label)}</div></div>
      <div class="field"><label>Date</label><div class="field-static">${data.exam_date ? escapeHtml(data.exam_date) : "—"}</div></div>
    </div>
  `;
}

// ---------- Subjects & thresholds ----------

async function loadThresholds() {
  const [{ data: thresholds, error: thErr }, { data: allSubjects }] = await Promise.all([
    supabaseClient.from("exam_subjects").select("id, subject_id, max_marks, min_marks, subjects ( name )").eq("exam_id", EXAM_ID),
    supabaseClient.from("subjects").select("id, name").order("name"),
  ]);

  const container = document.getElementById("thresholds-body");

  if (thErr) {
    container.innerHTML = `<p class="field-hint">Couldn't load subjects for this exam.</p>`;
    return;
  }

  const configuredSubjectIds = new Set((thresholds || []).map((t) => t.subject_id));
  const availableSubjects = (allSubjects || []).filter((s) => !configuredSubjectIds.has(s.id));

  const rows = (thresholds || [])
    .map(
      (t) => `
        <tr>
          <td>${escapeHtml(t.subjects.name)}</td>
          <td>${t.max_marks}</td>
          <td>${t.min_marks}</td>
          <td>${CAN_MANAGE_EXAMS ? `<button class="text-btn danger" data-remove-threshold="${t.id}">Remove</button>` : ""}</td>
        </tr>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="form-error" id="threshold-error"></div>
    <table>
      <thead><tr><th>Subject</th><th>Max Marks</th><th>Min (Pass) Marks</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="loading-row">No subjects configured yet.</td></tr>`}</tbody>
    </table>
    ${
      CAN_MANAGE_EXAMS && availableSubjects.length
        ? `
      <form id="add-threshold-form" class="inline-form-row" style="margin-top:16px; margin-bottom:0;">
        <div class="field">
          <select id="threshold-subject" required>
            <option value="">Subject…</option>
            ${availableSubjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><input type="number" id="threshold-max" placeholder="Max marks" min="1" step="1" required style="width:110px;" /></div>
        <div class="field"><input type="number" id="threshold-min" placeholder="Pass marks" min="0" step="1" required style="width:110px;" /></div>
        <button type="submit" class="btn btn-secondary">Add subject</button>
      </form>
    `
        : ""
    }
  `;

  if (CAN_MANAGE_EXAMS) {
    const addForm = document.getElementById("add-threshold-form");
    if (addForm) addForm.addEventListener("submit", onAddThreshold);

    container.querySelectorAll("[data-remove-threshold]").forEach((btn) => {
      btn.addEventListener("click", () => removeThreshold(btn.dataset.removeThreshold));
    });
  }

  await populateSubjectPicker(thresholds || []);
}

async function onAddThreshold(event) {
  event.preventDefault();
  const errorBox = document.getElementById("threshold-error");
  errorBox.classList.remove("visible");

  const subjectId = document.getElementById("threshold-subject").value;
  const maxMarks = Number(document.getElementById("threshold-max").value);
  const minMarks = Number(document.getElementById("threshold-min").value);

  if (minMarks > maxMarks) {
    errorBox.textContent = "Pass marks can't be higher than max marks.";
    errorBox.classList.add("visible");
    return;
  }

  const { error } = await supabaseClient.from("exam_subjects").insert({
    exam_id: EXAM_ID,
    subject_id: subjectId,
    max_marks: maxMarks,
    min_marks: minMarks,
  });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  await loadThresholds();
}

async function removeThreshold(thresholdId) {
  if (!confirm("Remove this subject from the exam? Any marks already recorded for it will be removed too.")) return;

  const { error } = await supabaseClient.from("exam_subjects").delete().eq("id", thresholdId);

  if (error) {
    alert(`Couldn't remove: ${error.message}`);
    return;
  }

  await loadThresholds();
}

// ---------- Marks entry ----------

async function populateSubjectPicker(thresholds) {
  const picker = document.getElementById("marks-subject-picker");

  if (!thresholds.length) {
    picker.innerHTML = `<p class="field-hint">Add a subject above before entering marks.</p>`;
    document.getElementById("marks-grid-area").innerHTML = "";
    return;
  }

  picker.innerHTML = `
    <div class="field" style="max-width:280px;">
      <label for="marks-subject-select">Subject</label>
      <select id="marks-subject-select">
        <option value="">Choose a subject…</option>
        ${thresholds.map((t) => `<option value="${t.subject_id}">${escapeHtml(t.subjects.name)} (max ${t.max_marks}, pass ${t.min_marks})</option>`).join("")}
      </select>
    </div>
  `;

  document.getElementById("marks-subject-select").addEventListener("change", (e) => {
    const threshold = thresholds.find((t) => t.subject_id === e.target.value);
    SELECTED_SUBJECT_ID = e.target.value || null;
    if (threshold) loadMarksGrid(threshold);
    else document.getElementById("marks-grid-area").innerHTML = "";
  });
}

async function loadMarksGrid(threshold) {
  const gridArea = document.getElementById("marks-grid-area");
  gridArea.innerHTML = `<div class="loading-row">Loading students…</div>`;

  const [{ data: enrollments, error: enrollErr }, { data: existingMarks, error: marksErr }] = await Promise.all([
    supabaseClient
      .from("student_academic_records")
      .select("student_id, roll_number, students ( full_name, sats_number )")
      .eq("academic_year_id", EXAM_DATA.academic_year_id)
      .eq("class_id", EXAM_DATA.class_id)
      .eq("enrollment_status", "active")
      .order("roll_number", { ascending: true, nullsFirst: false }),
    supabaseClient
      .from("marks")
      .select("student_id, scored_marks")
      .eq("exam_id", EXAM_ID)
      .eq("subject_id", threshold.subject_id),
  ]);

  if (enrollErr || marksErr) {
    gridArea.innerHTML = `<p class="field-hint">Couldn't load the class list.</p>`;
    return;
  }

  const scoredByStudent = {};
  (existingMarks || []).forEach((m) => (scoredByStudent[m.student_id] = m.scored_marks));

  if (!enrollments.length) {
    gridArea.innerHTML = `<p class="field-hint">No students enrolled in this class for the current year.</p>`;
    return;
  }

  const rowsHtml = enrollments
    .map((e) => {
      const scored = scoredByStudent[e.student_id];
      return `
        <tr data-student-row="${e.student_id}">
          <td>${e.roll_number ? escapeHtml(e.roll_number) : "—"}</td>
          <td>${escapeHtml(e.students.full_name)}</td>
          <td>
            <input type="number" min="0" max="${threshold.max_marks}" step="0.5" class="marks-input" data-student="${e.student_id}"
              value="${scored != null ? scored : ""}" style="width:90px; padding:6px 8px; border:1px solid var(--color-border); border-radius:6px;" ${CAN_MANAGE_MARKS ? "" : "disabled"} />
          </td>
          <td class="live-result" data-live-for="${e.student_id}">${scored != null ? resultBadge(scored, threshold) : "—"}</td>
        </tr>
      `;
    })
    .join("");

  gridArea.innerHTML = `
    <div class="form-error" id="marks-error"></div>
    <table>
      <thead><tr><th>Roll No.</th><th>Student</th><th>Scored (of ${threshold.max_marks})</th><th>Result</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${CAN_MANAGE_MARKS ? `<div class="form-actions"><button class="btn" id="save-marks-btn">Save Marks</button></div>` : ""}
  `;

  gridArea.querySelectorAll(".marks-input").forEach((input) => {
    input.addEventListener("input", () => {
      const val = input.value === "" ? null : Number(input.value);
      const cell = gridArea.querySelector(`[data-live-for="${input.dataset.student}"]`);
      cell.innerHTML = val != null ? resultBadge(val, threshold) : "—";
    });
  });

  const saveBtn = document.getElementById("save-marks-btn");
  if (saveBtn) saveBtn.addEventListener("click", () => saveMarksGrid(threshold));
}

function resultBadge(scored, threshold) {
  const pct = ((scored / threshold.max_marks) * 100).toFixed(1);
  const pass = scored >= threshold.min_marks;
  return `<span class="badge ${pass ? "badge-success" : "badge-danger"}">${pct}% — ${pass ? "PASS" : "FAIL"}</span>`;
}

async function saveMarksGrid(threshold) {
  const errorBox = document.getElementById("marks-error");
  errorBox.classList.remove("visible");

  const saveBtn = document.getElementById("save-marks-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const inputs = document.querySelectorAll(".marks-input");
  const rows = [];
  inputs.forEach((input) => {
    if (input.value !== "") {
      rows.push({
        student_id: input.dataset.student,
        exam_id: EXAM_ID,
        subject_id: threshold.subject_id,
        scored_marks: Number(input.value),
        recorded_by: CURRENT_USER_ID,
      });
    }
  });

  if (!rows.length) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Marks";
    return;
  }

  const { error } = await supabaseClient.from("marks").upsert(rows, { onConflict: "student_id,exam_id,subject_id" });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Marks";
    return;
  }

  saveBtn.textContent = "Saved ✓";
  setTimeout(() => {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Marks";
  }, 1500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
