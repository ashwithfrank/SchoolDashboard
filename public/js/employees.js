// ==========================================================
// Employees: list with type + active/inactive filters.
// Everyone can view (needed so staff can see who a coordinator
// or driver is); only Admin sees the Add/Edit controls.
// ==========================================================

let CAN_MANAGE = false;

(async () => {
  const { permissionCodes } = await initShell();
  CAN_MANAGE = permissionCodes.has("employees.manage");
  document.getElementById("page-title").textContent = "Employees";

  if (CAN_MANAGE) {
    document.getElementById("add-employee-link").style.display = "inline-flex";
  }

  document.getElementById("type-filter").addEventListener("change", load);
  document.getElementById("status-filter").addEventListener("change", load);
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    load();
  });

  await load();
})();

async function load() {
  const type = document.getElementById("type-filter").value;
  const status = document.getElementById("status-filter").value;
  const q = document.getElementById("search-input").value.trim();

  let query = supabaseClient
    .from("employees")
    .select("id, employee_code, full_name, employee_type, designation, contact_number, is_active")
    .order("full_name");

  if (type) query = query.eq("employee_type", type);
  if (status) query = query.eq("is_active", status === "active");
  if (q) {
    const safeQ = sanitizeForOrFilter(q);
    query = query.or(`full_name.ilike.%${safeQ}%,employee_code.ilike.%${safeQ}%,contact_number.ilike.%${safeQ}%`);
  }

  const { data, error } = await query;
  const tbody = document.getElementById("employees-tbody");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Couldn't load employees.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No employees match these filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (e) => `
        <tr>
          <td>${escapeHtml(e.employee_code)}</td>
          <td>${CAN_MANAGE ? `<a href="employee-form.html?id=${e.id}">${escapeHtml(e.full_name)}</a>` : escapeHtml(e.full_name)}</td>
          <td>${typeBadge(e.employee_type)}</td>
          <td>${e.designation ? escapeHtml(e.designation) : "—"}</td>
          <td>${e.contact_number ? escapeHtml(e.contact_number) : "—"}</td>
          <td>${e.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
        </tr>
      `
    )
    .join("");
}

function typeBadge(type) {
  const labels = { teaching: "Teaching", office: "Office", driver: "Driver", other: "Other" };
  return `<span class="badge badge-neutral">${labels[type] || escapeHtml(type)}</span>`;
}

function sanitizeForOrFilter(str) {
  return str.replace(/[,()]/g, " ").trim();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
