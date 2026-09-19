// ==========================================================
// Add/Edit Employee. Admin-only (employees.manage) — RLS enforces
// it regardless, but this checks up front for a clean message.
// ==========================================================

let EMPLOYEE_ID = null;
let IS_EDIT = false;

(async () => {
  const { permissionCodes } = await initShell();

  if (!permissionCodes.has("employees.manage")) {
    document.getElementById("form-area").innerHTML = `
      <div class="access-denied card">
        <h2>Not authorized</h2>
        <p>Only an administrator can add or edit employees.</p>
      </div>
    `;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  EMPLOYEE_ID = params.get("id");
  IS_EDIT = !!EMPLOYEE_ID;

  document.getElementById("page-title").textContent = IS_EDIT ? "Edit Employee" : "Add Employee";
  document.getElementById("form-heading").textContent = IS_EDIT ? "Edit Employee" : "Add Employee";

  if (IS_EDIT) {
    document.getElementById("active-field-wrap").style.display = "block";
    await loadEmployee();
  }

  document.getElementById("employee-form").addEventListener("submit", onSubmit);
})();

async function loadEmployee() {
  const { data, error } = await supabaseClient.from("employees").select("*").eq("id", EMPLOYEE_ID).maybeSingle();

  if (error || !data) {
    document.getElementById("form-area").innerHTML = `<div class="loading-row">Employee not found.</div>`;
    return;
  }

  document.getElementById("full_name").value = data.full_name;
  document.getElementById("employee_code").value = data.employee_code;
  document.getElementById("employee_type").value = data.employee_type;
  document.getElementById("designation").value = data.designation || "";
  document.getElementById("contact_number").value = data.contact_number || "";
  document.getElementById("email").value = data.email || "";
  document.getElementById("address").value = data.address || "";
  document.getElementById("joining_date").value = data.joining_date || "";
  document.getElementById("is_active").checked = data.is_active;
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
    employee_code: val("employee_code"),
    employee_type: val("employee_type"),
    designation: val("designation") || null,
    contact_number: val("contact_number") || null,
    email: val("email") || null,
    address: val("address") || null,
    joining_date: val("joining_date") || null,
  };

  if (IS_EDIT) {
    payload.is_active = document.getElementById("is_active").checked;
  }

  const query = IS_EDIT
    ? supabaseClient.from("employees").update(payload).eq("id", EMPLOYEE_ID)
    : supabaseClient.from("employees").insert(payload);

  const { error } = await query;

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    submitBtn.disabled = false;
    submitBtn.textContent = IS_EDIT ? "Save changes" : "Add Employee";
    return;
  }

  window.location.href = "employees.html";
}

function val(id) {
  return document.getElementById(id).value.trim();
}
