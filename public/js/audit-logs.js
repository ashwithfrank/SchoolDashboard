// ==========================================================
// Audit Logs: Admin-only. Paginated (most recent first, load
// more rather than loading the whole table), filterable by
// entity type and date range. Each row's full before/after
// snapshot is available but collapsed by default to keep the
// list scannable.
// ==========================================================

const PAGE_SIZE = 50;
let CURRENT_OFFSET = 0;

const ENTITY_TYPES = [
  "students",
  "employees",
  "buses",
  "fee_payments",
  "student_fee_assignments",
  "student_transport_assignments",
  "marks",
  "student_academic_records",
];

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Audit Logs";

  if (!permissionCodes.has("audit_logs.view")) {
    document.getElementById("audit-content").innerHTML = `
      <div class="access-denied card">
        <h2>Not authorized</h2>
        <p>Audit logs are visible to administrators only.</p>
      </div>
    `;
    return;
  }

  document.getElementById("audit-content").innerHTML = pageHtml();
  wireControls();
  await loadPage(true);
})();

function pageHtml() {
  const typeOptions = ENTITY_TYPES.map((t) => `<option value="${t}">${labelForEntity(t)}</option>`).join("");

  return `
    <div class="filter-bar card">
      <div class="field">
        <label for="filter-entity">Entity</label>
        <select id="filter-entity"><option value="">All</option>${typeOptions}</select>
      </div>
      <div class="field">
        <label for="filter-from">From</label>
        <input type="date" id="filter-from" />
      </div>
      <div class="field">
        <label for="filter-to">To</label>
        <input type="date" id="filter-to" />
      </div>
      <button class="btn" id="apply-filters-btn">Apply</button>
    </div>

    <div class="card">
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th></th></tr></thead>
        <tbody id="audit-tbody"><tr><td colspan="5" class="loading-row">Loading…</td></tr></tbody>
      </table>
      <div style="text-align:center; margin-top:16px;">
        <button class="btn btn-secondary" id="load-more-btn" style="display:none;">Load more</button>
        <p class="field-hint" id="no-more-hint" style="display:none;">No more entries.</p>
      </div>
    </div>
  `;
}

function wireControls() {
  document.getElementById("apply-filters-btn").addEventListener("click", () => loadPage(true));
  document.getElementById("load-more-btn").addEventListener("click", () => loadPage(false));
}

async function loadPage(reset) {
  if (reset) {
    CURRENT_OFFSET = 0;
    document.getElementById("audit-tbody").innerHTML = `<tr><td colspan="5" class="loading-row">Loading…</td></tr>`;
    document.getElementById("no-more-hint").style.display = "none";
  }

  const entityFilter = document.getElementById("filter-entity").value;
  const fromFilter = document.getElementById("filter-from").value;
  const toFilter = document.getElementById("filter-to").value;

  let query = supabaseClient
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, changes, created_at, profiles ( full_name )")
    .order("created_at", { ascending: false })
    .range(CURRENT_OFFSET, CURRENT_OFFSET + PAGE_SIZE - 1);

  if (entityFilter) query = query.eq("entity_type", entityFilter);
  if (fromFilter) query = query.gte("created_at", `${fromFilter}T00:00:00`);
  if (toFilter) query = query.lte("created_at", `${toFilter}T23:59:59`);

  const { data, error } = await query;
  const tbody = document.getElementById("audit-tbody");
  const loadMoreBtn = document.getElementById("load-more-btn");
  const noMoreHint = document.getElementById("no-more-hint");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Couldn't load audit logs.</td></tr>`;
    return;
  }

  const rowsHtml = (data || [])
    .map(
      (r) => `
        <tr>
          <td>${formatTimestamp(r.created_at)}</td>
          <td>${r.profiles ? escapeHtml(r.profiles.full_name) : "—"}</td>
          <td><span class="badge badge-neutral">${escapeHtml(r.action)}</span></td>
          <td>${escapeHtml(r.entity_type)}</td>
          <td><button class="text-btn" data-toggle-changes="${r.id}">View</button></td>
        </tr>
        <tr id="changes-row-${r.id}" style="display:none;">
          <td colspan="5"><pre style="white-space:pre-wrap; font-size:12px; background:var(--color-bg); padding:10px 12px; border-radius:6px; margin:0;">${escapeHtml(JSON.stringify(r.changes, null, 2))}</pre></td>
        </tr>
      `
    )
    .join("");

  if (reset) {
    tbody.innerHTML = rowsHtml || `<tr><td colspan="5" class="loading-row">No matching entries.</td></tr>`;
  } else {
    tbody.insertAdjacentHTML("beforeend", rowsHtml);
  }

  tbody.querySelectorAll("[data-toggle-changes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = document.getElementById(`changes-row-${btn.dataset.toggleChanges}`);
      const isHidden = row.style.display === "none";
      row.style.display = isHidden ? "table-row" : "none";
      btn.textContent = isHidden ? "Hide" : "View";
    });
  });

  const gotFullPage = (data || []).length === PAGE_SIZE;
  loadMoreBtn.style.display = gotFullPage ? "inline-flex" : "none";
  noMoreHint.style.display = gotFullPage ? "none" : (data || []).length ? "block" : "none";

  CURRENT_OFFSET += (data || []).length;
}

function labelForEntity(t) {
  return t
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
