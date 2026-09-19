// ==========================================================
// Bus detail: fleet info (visible to everyone) + assigned
// students for the current year. The roster includes each
// student's individual fee, which is financial data — so it's
// only shown to roles that can already see fee data
// (transport.manage or fee_reports.view), matching the RLS on
// student_transport_assignments itself.
// ==========================================================

let BUS_ID = null;
let CAN_MANAGE_BUS = false;
let CAN_SEE_ROSTER = false;

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Bus Detail";

  CAN_MANAGE_BUS = permissionCodes.has("buses.manage");
  CAN_SEE_ROSTER = permissionCodes.has("transport.manage") || permissionCodes.has("fee_reports.view");

  const params = new URLSearchParams(window.location.search);
  BUS_ID = params.get("id");

  if (!BUS_ID) {
    document.getElementById("detail-area").innerHTML = `<div class="loading-row">No bus specified.</div>`;
    return;
  }

  await loadBus();
  if (CAN_SEE_ROSTER) {
    await loadRoster();
  } else {
    document.getElementById("roster-body").innerHTML = `
      <p class="field-hint">Transport assignment details aren't visible to your role.</p>
    `;
  }
})();

async function loadBus() {
  const { data, error } = await supabaseClient
    .from("buses")
    .select("id, bus_number, insurance_expiry_date, fc_expiry_date, capacity, is_active, employees ( full_name, contact_number )")
    .eq("id", BUS_ID)
    .maybeSingle();

  if (error || !data) {
    document.getElementById("detail-area").innerHTML = `<div class="loading-row">Bus not found.</div>`;
    return;
  }

  document.getElementById("bus-heading").textContent = data.bus_number;
  document.getElementById("edit-bus-link").href = `bus-form.html?id=${data.id}`;
  if (CAN_MANAGE_BUS) document.getElementById("edit-bus-link").style.display = "inline-flex";

  document.getElementById("bus-info").innerHTML = `
    <div class="form-grid">
      ${field("Status", data.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>')}
      ${field("Driver", data.employees ? escapeHtml(data.employees.full_name) : "—")}
      ${field("Driver contact", data.employees && data.employees.contact_number ? escapeHtml(data.employees.contact_number) : "—")}
      ${field("Capacity", data.capacity ?? "—")}
      ${field("Insurance expiry", data.insurance_expiry_date ? escapeHtml(data.insurance_expiry_date) : "Not set")}
      ${field("FC expiry", data.fc_expiry_date ? escapeHtml(data.fc_expiry_date) : "Not set")}
    </div>
  `;
}

async function loadRoster() {
  const { data: year } = await supabaseClient.from("academic_years").select("id, label").eq("is_current", true).maybeSingle();

  if (!year) {
    document.getElementById("roster-body").innerHTML = `<p class="field-hint">No current academic year set.</p>`;
    return;
  }

  const { data, error } = await supabaseClient
    .from("student_transport_assignments")
    .select("location, distance_km, bus_fee, students ( id, full_name, sats_number )")
    .eq("bus_id", BUS_ID)
    .eq("academic_year_id", year.id)
    .eq("is_active", true)
    .order("location");

  const container = document.getElementById("roster-body");

  if (error) {
    container.innerHTML = `<p class="field-hint">Couldn't load the roster.</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `<p class="field-hint">No students assigned to this bus for ${escapeHtml(year.label)} yet. Assign one from the student's own profile (Transport tab).</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr><th>Student</th><th>SATS Number</th><th>Location</th><th>Distance</th><th>Bus Fee</th></tr></thead>
      <tbody>
        ${data
          .map(
            (r) => `
              <tr>
                <td><a href="student-profile.html?id=${r.students.id}">${escapeHtml(r.students.full_name)}</a></td>
                <td>${escapeHtml(r.students.sats_number)}</td>
                <td>${r.location ? escapeHtml(r.location) : "—"}</td>
                <td>${r.distance_km != null ? r.distance_km + " km" : "—"}</td>
                <td>${formatCurrency(r.bus_fee)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function field(label, value) {
  return `<div class="field"><label>${label}</label><div class="field-static">${value}</div></div>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
