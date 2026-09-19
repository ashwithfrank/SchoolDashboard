// ==========================================================
// Buses: fleet list with insurance/FC expiry status at a glance.
// Everyone can view; only Admin sees Add/Edit controls.
// ==========================================================

let CAN_MANAGE = false;

(async () => {
  const { permissionCodes } = await initShell();
  CAN_MANAGE = permissionCodes.has("buses.manage");
  document.getElementById("page-title").textContent = "Buses";

  if (CAN_MANAGE) {
    document.getElementById("add-bus-link").style.display = "inline-flex";
  }

  await load();
})();

async function load() {
  const { data, error } = await supabaseClient
    .from("buses")
    .select("id, bus_number, insurance_expiry_date, fc_expiry_date, capacity, is_active, employees ( full_name )")
    .order("bus_number");

  const tbody = document.getElementById("buses-tbody");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Couldn't load buses.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No buses yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (b) => `
        <tr>
          <td><a href="bus-detail.html?id=${b.id}">${escapeHtml(b.bus_number)}</a></td>
          <td>${b.employees ? escapeHtml(b.employees.full_name) : "—"}</td>
          <td>${expiryBadge(b.insurance_expiry_date)}</td>
          <td>${expiryBadge(b.fc_expiry_date)}</td>
          <td>${b.capacity ?? "—"}</td>
          <td>${b.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
        </tr>
      `
    )
    .join("");
}

function expiryBadge(dateStr) {
  if (!dateStr) return '<span class="badge badge-neutral">Not set</span>';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr + "T00:00:00");
  const daysLeft = Math.round((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return `<span class="badge badge-danger">Expired ${escapeHtml(dateStr)}</span>`;
  if (daysLeft <= 30) return `<span class="badge badge-warning">Expires ${escapeHtml(dateStr)}</span>`;
  return `<span class="badge badge-success">Valid until ${escapeHtml(dateStr)}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
