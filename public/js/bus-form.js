// ==========================================================
// Add/Edit Bus. Admin-only (buses.manage).
// ==========================================================

let BUS_ID = null;
let IS_EDIT = false;

(async () => {
  const { permissionCodes } = await initShell();

  if (!permissionCodes.has("buses.manage")) {
    document.getElementById("form-area").innerHTML = `
      <div class="access-denied card">
        <h2>Not authorized</h2>
        <p>Only an administrator can add or edit buses.</p>
      </div>
    `;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  BUS_ID = params.get("id");
  IS_EDIT = !!BUS_ID;

  document.getElementById("page-title").textContent = IS_EDIT ? "Edit Bus" : "Add Bus";
  document.getElementById("form-heading").textContent = IS_EDIT ? "Edit Bus" : "Add Bus";

  if (IS_EDIT) {
    document.getElementById("active-field-wrap").style.display = "block";
  }

  await populateDrivers();

  if (IS_EDIT) {
    await loadBus();
  }

  document.getElementById("bus-form").addEventListener("submit", onSubmit);
})();

async function populateDrivers() {
  const { data } = await supabaseClient
    .from("employees")
    .select("id, full_name")
    .eq("employee_type", "driver")
    .eq("is_active", true)
    .order("full_name");

  const select = document.getElementById("driver_id");
  select.innerHTML =
    `<option value="">No driver assigned</option>` +
    (data || []).map((d) => `<option value="${d.id}">${escapeHtml(d.full_name)}</option>`).join("");
}

async function loadBus() {
  const { data, error } = await supabaseClient.from("buses").select("*").eq("id", BUS_ID).maybeSingle();

  if (error || !data) {
    document.getElementById("form-area").innerHTML = `<div class="loading-row">Bus not found.</div>`;
    return;
  }

  document.getElementById("bus_number").value = data.bus_number;
  document.getElementById("driver_id").value = data.driver_id || "";
  document.getElementById("insurance_expiry_date").value = data.insurance_expiry_date || "";
  document.getElementById("fc_expiry_date").value = data.fc_expiry_date || "";
  document.getElementById("capacity").value = data.capacity ?? "";
  document.getElementById("is_active").checked = data.is_active;
}

async function onSubmit(event) {
  event.preventDefault();
  const errorBox = document.getElementById("form-error");
  errorBox.classList.remove("visible");

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  const capacityVal = val("capacity");

  const payload = {
    bus_number: val("bus_number"),
    driver_id: val("driver_id") || null,
    insurance_expiry_date: val("insurance_expiry_date") || null,
    fc_expiry_date: val("fc_expiry_date") || null,
    capacity: capacityVal ? Number(capacityVal) : null,
  };

  if (IS_EDIT) {
    payload.is_active = document.getElementById("is_active").checked;
  }

  const query = IS_EDIT
    ? supabaseClient.from("buses").update(payload).eq("id", BUS_ID)
    : supabaseClient.from("buses").insert(payload);

  const { error } = await query;

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    submitBtn.disabled = false;
    submitBtn.textContent = IS_EDIT ? "Save changes" : "Add Bus";
    return;
  }

  window.location.href = "buses.html";
}

function val(id) {
  return document.getElementById(id).value.trim();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
