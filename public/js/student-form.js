// ==========================================================
// Add Student: creates the students row, then the initial
// student_academic_records enrollment row for the current year.
// Admin-only (students.manage) — RLS enforces it regardless, but
// this checks up front so a non-admin sees a plain message
// instead of a form that will fail on submit.
// ==========================================================

let CURRENT_YEAR = null;

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Add Student";

  if (!permissionCodes.has("students.manage")) {
    document.getElementById("form-area").innerHTML = `
      <div class="access-denied card">
        <h2>Not authorized</h2>
        <p>Only an administrator can add new students.</p>
      </div>
    `;
    return;
  }

  const { data: year } = await supabaseClient
    .from("academic_years")
    .select("id, label")
    .eq("is_current", true)
    .maybeSingle();
  CURRENT_YEAR = year || null;

  if (!CURRENT_YEAR) {
    document.getElementById("form-area").innerHTML = `
      <div class="access-denied card">
        <h2>No current academic year set</h2>
        <p>Set the current academic year in <a href="settings.html">Settings</a> before adding students.</p>
      </div>
    `;
    return;
  }

  document.getElementById("current-year-label").textContent = CURRENT_YEAR.label;

  await populateClasses();

  const params = new URLSearchParams(window.location.search);
  const presetClass = params.get("class");
  const presetSection = params.get("section");
  if (presetClass) {
    document.getElementById("class-select").value = presetClass;
    await populateSections(presetClass, presetSection);
  }

  document.getElementById("class-select").addEventListener("change", (e) => populateSections(e.target.value));
  document.getElementById("student-form").addEventListener("submit", onSubmit);
})();

async function populateClasses() {
  const { data } = await supabaseClient.from("classes").select("id, name").order("sort_order");
  const select = document.getElementById("class-select");
  select.innerHTML =
    `<option value="">Select a class…</option>` +
    (data || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

async function populateSections(classId, preselect) {
  const select = document.getElementById("section-select");
  if (!classId) {
    select.innerHTML = `<option value="">Select a class first…</option>`;
    return;
  }
  const { data } = await supabaseClient
    .from("sections")
    .select("id, name")
    .eq("class_id", classId)
    .eq("is_active", true)
    .order("sort_order");

  select.innerHTML =
    `<option value="">Select a section…</option>` +
    (data || []).map((s) => `<option value="${s.id}">Section ${escapeHtml(s.name)}</option>`).join("");

  if (preselect) select.value = preselect;
}

async function onSubmit(event) {
  event.preventDefault();
  const errorBox = document.getElementById("form-error");
  errorBox.classList.remove("visible");

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  const payload = {
    full_name: val("full_name"),
    sats_number: val("sats_number"),
    admission_number: val("admission_number") || null,
    father_name: val("father_name") || null,
    mother_name: val("mother_name") || null,
    contact_number: val("contact_number") || null,
    gender: val("gender") || null,
    date_of_birth: val("date_of_birth") || null,
  };

  const classId = document.getElementById("class-select").value;
  const sectionId = document.getElementById("section-select").value;
  const rollNumber = val("roll_number") || null;

  if (!classId || !sectionId) {
    errorBox.textContent = "Choose a class and section.";
    errorBox.classList.add("visible");
    resetSubmitButton(submitBtn);
    return;
  }

  const { data: student, error: studentError } = await supabaseClient
    .from("students")
    .insert(payload)
    .select("id")
    .single();

  if (studentError) {
    errorBox.textContent = studentError.message;
    errorBox.classList.add("visible");
    resetSubmitButton(submitBtn);
    return;
  }

  const { error: enrollError } = await supabaseClient.from("student_academic_records").insert({
    student_id: student.id,
    academic_year_id: CURRENT_YEAR.id,
    class_id: classId,
    section_id: sectionId,
    roll_number: rollNumber,
    enrollment_status: "active",
  });

  if (enrollError) {
    errorBox.textContent = `Student was created, but enrollment failed: ${enrollError.message}. Open the student's profile to try enrolling them again.`;
    errorBox.classList.add("visible");
    resetSubmitButton(submitBtn);
    return;
  }

  window.location.href = `student-profile.html?id=${student.id}`;
}

function resetSubmitButton(btn) {
  btn.disabled = false;
  btn.textContent = "Add Student";
}

function val(id) {
  return document.getElementById(id).value.trim();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
