// ==========================================================
// Student profile: Basic (view/edit) + Academic history are
// functional. Transport/Fees/Academics tabs are placeholders
// until their phases ship.
// ==========================================================

let STUDENT_ID = null;
let CAN_EDIT_IDENTITY = false;
let CAN_MANAGE_STATUS = false;
let STUDENT_DATA = null;

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Student Profile";

  CAN_EDIT_IDENTITY = permissionCodes.has("students.edit") || permissionCodes.has("students.manage");
  CAN_MANAGE_STATUS = permissionCodes.has("students.manage");

  const params = new URLSearchParams(window.location.search);
  STUDENT_ID = params.get("id");

  if (!STUDENT_ID) {
    document.getElementById("profile-area").innerHTML = `<div class="loading-row">No student specified.</div>`;
    return;
  }

  wireTabs();
  await loadStudent();
  await loadAcademicHistory();
})();

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

// ---------- Basic tab ----------

async function loadStudent() {
  const { data, error } = await supabaseClient.from("students").select("*").eq("id", STUDENT_ID).maybeSingle();

  if (error || !data) {
    document.getElementById("profile-area").innerHTML = `<div class="loading-row">Student not found, or you don't have access.</div>`;
    return;
  }

  STUDENT_DATA = data;
  document.getElementById("student-name-heading").textContent = data.full_name;
  document.getElementById("student-subheading").textContent = `SATS ${data.sats_number}`;
  renderBasicView();
}

function renderBasicView() {
  const s = STUDENT_DATA;
  const editButton = CAN_EDIT_IDENTITY ? `<button class="btn btn-secondary" id="edit-basic-btn">Edit</button>` : "";

  document.getElementById("panel-basic").innerHTML = `
    <div class="toolbar"><div>${statusBadge(s.status)}</div>${editButton}</div>
    <div class="form-grid">
      ${field("Full name", s.full_name)}
      ${field("SATS number", s.sats_number)}
      ${field("Admission number", s.admission_number || "—")}
      ${field("Gender", s.gender || "—")}
      ${field("Date of birth", s.date_of_birth || "—")}
      ${field("Father's name", s.father_name || "—")}
      ${field("Mother's name", s.mother_name || "—")}
      ${field("Contact number", s.contact_number || "—")}
    </div>
  `;

  const btn = document.getElementById("edit-basic-btn");
  if (btn) btn.addEventListener("click", renderBasicEditForm);
}

function field(label, value) {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="field-static">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderBasicEditForm() {
  const s = STUDENT_DATA;
  const statusControl = CAN_MANAGE_STATUS
    ? `
      <div class="field">
        <label for="edit-status">Status</label>
        <select id="edit-status">
          ${["active", "alumni", "transferred_out", "inactive"]
            .map((st) => `<option value="${st}" ${st === s.status ? "selected" : ""}>${st}</option>`)
            .join("")}
        </select>
      </div>
    `
    : "";

  document.getElementById("panel-basic").innerHTML = `
    <div class="form-error" id="basic-edit-error"></div>
    <form id="basic-edit-form">
      <div class="form-grid">
        <div class="field"><label for="edit-full_name">Full name</label><input type="text" id="edit-full_name" value="${attr(s.full_name)}" required /></div>
        <div class="field"><label for="edit-sats_number">SATS number</label><input type="text" id="edit-sats_number" value="${attr(s.sats_number)}" required /></div>
        <div class="field"><label for="edit-admission_number">Admission number</label><input type="text" id="edit-admission_number" value="${attr(s.admission_number || "")}" /></div>
        <div class="field">
          <label for="edit-gender">Gender</label>
          <select id="edit-gender">
            <option value="">—</option>
            <option value="male" ${s.gender === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${s.gender === "female" ? "selected" : ""}>Female</option>
            <option value="other" ${s.gender === "other" ? "selected" : ""}>Other</option>
          </select>
        </div>
        <div class="field"><label for="edit-date_of_birth">Date of birth</label><input type="date" id="edit-date_of_birth" value="${attr(s.date_of_birth || "")}" /></div>
        <div class="field"><label for="edit-father_name">Father's name</label><input type="text" id="edit-father_name" value="${attr(s.father_name || "")}" /></div>
        <div class="field"><label for="edit-mother_name">Mother's name</label><input type="text" id="edit-mother_name" value="${attr(s.mother_name || "")}" /></div>
        <div class="field"><label for="edit-contact_number">Contact number</label><input type="text" id="edit-contact_number" value="${attr(s.contact_number || "")}" /></div>
        ${statusControl}
      </div>
      <div class="form-actions">
        <button type="submit" class="btn" id="save-basic-btn">Save</button>
        <button type="button" class="btn btn-secondary" id="cancel-basic-btn">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById("cancel-basic-btn").addEventListener("click", renderBasicView);
  document.getElementById("basic-edit-form").addEventListener("submit", onSaveBasic);
}

async function onSaveBasic(event) {
  event.preventDefault();
  const errorBox = document.getElementById("basic-edit-error");
  errorBox.classList.remove("visible");

  const saveBtn = document.getElementById("save-basic-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const payload = {
    full_name: iv("edit-full_name"),
    sats_number: iv("edit-sats_number"),
    admission_number: iv("edit-admission_number") || null,
    gender: iv("edit-gender") || null,
    date_of_birth: iv("edit-date_of_birth") || null,
    father_name: iv("edit-father_name") || null,
    mother_name: iv("edit-mother_name") || null,
    contact_number: iv("edit-contact_number") || null,
  };

  if (CAN_MANAGE_STATUS) {
    const statusEl = document.getElementById("edit-status");
    if (statusEl) payload.status = statusEl.value;
  }

  const { data, error } = await supabaseClient
    .from("students")
    .update(payload)
    .eq("id", STUDENT_ID)
    .select("*")
    .single();

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
    return;
  }

  STUDENT_DATA = data;
  document.getElementById("student-name-heading").textContent = data.full_name;
  document.getElementById("student-subheading").textContent = `SATS ${data.sats_number}`;
  renderBasicView();
}

// ---------- Academic tab ----------

async function loadAcademicHistory() {
  const { data, error } = await supabaseClient
    .from("student_academic_records")
    .select("academic_year_id, roll_number, enrollment_status, academic_years ( label, is_current ), classes ( name ), sections ( name )")
    .eq("student_id", STUDENT_ID)
    .order("academic_year_id", { ascending: false });

  const panel = document.getElementById("panel-academic");

  if (error) {
    panel.innerHTML = `<div class="loading-row">Couldn't load academic history.</div>`;
    return;
  }

  if (!data.length) {
    panel.innerHTML = `<p class="field-hint">No academic enrollment on record yet.</p>`;
    return;
  }

  panel.innerHTML = `
    <table>
      <thead><tr><th>Academic Year</th><th>Class</th><th>Section</th><th>Roll No.</th><th>Status</th></tr></thead>
      <tbody>
        ${data
          .map(
            (r) => `
              <tr>
                <td>${escapeHtml(r.academic_years.label)} ${r.academic_years.is_current ? '<span class="badge badge-success" style="margin-left:6px;">Current</span>' : ""}</td>
                <td>${escapeHtml(r.classes.name)}</td>
                <td>${escapeHtml(r.sections.name)}</td>
                <td>${r.roll_number ? escapeHtml(r.roll_number) : "—"}</td>
                <td><span class="badge badge-neutral">${escapeHtml(r.enrollment_status)}</span></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ---------- Helpers ----------

function statusBadge(status) {
  const map = {
    active: "badge-success",
    alumni: "badge-neutral",
    transferred_out: "badge-warning",
    inactive: "badge-danger",
  };
  return `<span class="badge ${map[status] || "badge-neutral"}">${escapeHtml(status)}</span>`;
}

function iv(id) {
  return document.getElementById(id).value.trim();
}

function attr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
