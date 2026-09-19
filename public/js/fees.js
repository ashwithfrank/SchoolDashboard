// ==========================================================
// Fee Collection hub:
//  - current-year totals (collected / pending)
//  - class-wise collection breakdown
//  - fee structure management (academic fee per class per year)
//  - a student search that hands off to the profile's Fees tab,
//    where payments are actually recorded (per-student, matching
//    the confirmed profile layout)
// Admin + Office only, per the confirmed role matrix. Recording a
// payment happens on the student's own profile, not here.
// ==========================================================

let CAN_MANAGE_FEES = false;
let CURRENT_YEAR = null;

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Fee Collection";

  CAN_MANAGE_FEES = permissionCodes.has("academic_fees.manage");
  const canViewFees = CAN_MANAGE_FEES || permissionCodes.has("fee_reports.view");

  if (!canViewFees) {
    document.getElementById("fees-content").innerHTML = `
      <div class="access-denied card">
        <h2>No fee access</h2>
        <p>Your role doesn't include fee collection or reports. If you think this is wrong, ask an administrator.</p>
      </div>
    `;
    return;
  }

  const { data: year } = await supabaseClient.from("academic_years").select("id, label").eq("is_current", true).maybeSingle();
  CURRENT_YEAR = year || null;

  if (!CURRENT_YEAR) {
    document.getElementById("fees-content").innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">📅</div>
        <h2>No current academic year set</h2>
        <p>Set the current academic year in <a href="settings.html">Settings</a> first.</p>
      </div>
    `;
    return;
  }

  document.getElementById("fees-content").innerHTML = pageHtml();
  wireSearch();

  await loadSummaryAndClassBreakdown();
  await loadFeeStructures();
})();

function pageHtml() {
  return `
    <div class="stat-grid" id="summary-cards">
      <div class="card stat-card"><div class="stat-label">Total Fee (this year)</div><div class="stat-value" id="sum-total">—</div></div>
      <div class="card stat-card"><div class="stat-label">Collected</div><div class="stat-value" id="sum-paid">—</div></div>
      <div class="card stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="sum-pending">—</div></div>
    </div>

    <div class="card section-block">
      <h3>Collection by Class</h3>
      <table>
        <thead><tr><th>Class</th><th>Total Fee</th><th>Collected</th><th>Pending</th></tr></thead>
        <tbody id="class-breakdown-tbody"><tr><td colspan="4" class="loading-row">Loading…</td></tr></tbody>
      </table>
    </div>

    <div class="card section-block">
      <h3>Fee Structures — ${escapeHtml(CURRENT_YEAR.label)}</h3>
      <p class="field-hint" style="margin-bottom:14px;">The standard academic fee per class for the current year. Individual students can still get a discount from their own profile.</p>
      <div id="fs-error" class="form-error"></div>
      <table>
        <thead><tr><th>Class</th><th>Academic Fee</th><th></th></tr></thead>
        <tbody id="fs-tbody"><tr><td colspan="3" class="loading-row">Loading…</td></tr></tbody>
      </table>
    </div>

    <div class="card section-block">
      <h3>Find a Student</h3>
      <p class="field-hint" style="margin-bottom:14px;">Payments are recorded from the student's own profile (Fees tab).</p>
      <form id="fee-search-form" class="search-bar" style="margin-bottom:0;">
        <input type="search" id="fee-search-input" placeholder="Search by name, SATS number, or admission number" />
        <button type="submit" class="btn btn-secondary">Search</button>
      </form>
      <div id="fee-search-results"></div>
    </div>
  `;
}

// ---------- Summary + class breakdown ----------

async function loadSummaryAndClassBreakdown() {
  const [{ data: enroll, error: enrollErr }, { data: summary, error: sumErr }] = await Promise.all([
    supabaseClient
      .from("student_academic_records")
      .select("student_id, class_id, classes ( name, sort_order )")
      .eq("academic_year_id", CURRENT_YEAR.id)
      .eq("enrollment_status", "active"),
    supabaseClient
      .from("student_fee_summary")
      .select("student_id, total_fee, total_paid, pending")
      .eq("academic_year_id", CURRENT_YEAR.id),
  ]);

  const tbody = document.getElementById("class-breakdown-tbody");

  if (enrollErr || sumErr) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-row">Couldn't load fee data.</td></tr>`;
    return;
  }

  const summaryByStudent = {};
  (summary || []).forEach((s) => (summaryByStudent[s.student_id] = s));

  const byClass = {};
  let grandTotal = 0,
    grandPaid = 0,
    grandPending = 0;

  (enroll || []).forEach((e) => {
    const s = summaryByStudent[e.student_id];
    if (!s) return; // no fee assignment set up yet for this student
    const key = e.class_id;
    if (!byClass[key]) {
      byClass[key] = { name: e.classes.name, sort: e.classes.sort_order, total: 0, paid: 0, pending: 0 };
    }
    byClass[key].total += Number(s.total_fee) || 0;
    byClass[key].paid += Number(s.total_paid) || 0;
    byClass[key].pending += Number(s.pending) || 0;
    grandTotal += Number(s.total_fee) || 0;
    grandPaid += Number(s.total_paid) || 0;
    grandPending += Number(s.pending) || 0;
  });

  document.getElementById("sum-total").textContent = formatCurrency(grandTotal);
  document.getElementById("sum-paid").textContent = formatCurrency(grandPaid);
  document.getElementById("sum-pending").textContent = formatCurrency(grandPending);

  const rows = Object.values(byClass).sort((a, b) => a.sort - b.sort);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-row">No fee assignments set up yet. Set fee structures below, then assign fees from each student's profile.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${formatCurrency(r.total)}</td>
          <td>${formatCurrency(r.paid)}</td>
          <td>${formatCurrency(r.pending)}</td>
        </tr>
      `
    )
    .join("");
}

// ---------- Fee structures ----------

async function loadFeeStructures() {
  const [{ data: classes, error: classErr }, { data: structures, error: fsErr }] = await Promise.all([
    supabaseClient.from("classes").select("id, name, sort_order").order("sort_order"),
    supabaseClient.from("fee_structures").select("id, class_id, academic_fee").eq("academic_year_id", CURRENT_YEAR.id),
  ]);

  const tbody = document.getElementById("fs-tbody");

  if (classErr || fsErr) {
    tbody.innerHTML = `<tr><td colspan="3" class="loading-row">Couldn't load fee structures.</td></tr>`;
    return;
  }

  const byClass = {};
  (structures || []).forEach((s) => (byClass[s.class_id] = s));

  tbody.innerHTML = classes
    .map((c) => {
      const fs = byClass[c.id];
      return `
        <tr data-class-row="${c.id}">
          <td>${escapeHtml(c.name)}</td>
          <td>${fs ? formatCurrency(fs.academic_fee) : '<span class="badge badge-neutral">Not set</span>'}</td>
          <td>${CAN_MANAGE_FEES ? `<button class="text-btn" data-edit-fs="${c.id}" data-current="${fs ? fs.academic_fee : ""}">${fs ? "Edit" : "Set fee"}</button>` : ""}</td>
        </tr>
      `;
    })
    .join("");

  if (!CAN_MANAGE_FEES) return;

  tbody.querySelectorAll("[data-edit-fs]").forEach((btn) => {
    btn.addEventListener("click", () => editFeeStructureRow(btn.dataset.editFs, btn.dataset.current));
  });
}

function editFeeStructureRow(classId, currentValue) {
  const row = document.querySelector(`tr[data-class-row="${classId}"]`);
  const cells = row.querySelectorAll("td");
  cells[1].innerHTML = `<input type="number" min="0" step="1" id="fs-input-${classId}" value="${currentValue}" style="width:140px; padding:6px 8px; border:1px solid var(--color-border); border-radius:6px;" />`;
  cells[2].innerHTML = `<button class="text-btn" data-save-fs="${classId}">Save</button> <button class="text-btn" data-cancel-fs="${classId}">Cancel</button>`;

  document.querySelector(`[data-save-fs="${classId}"]`).addEventListener("click", () => saveFeeStructure(classId));
  document.querySelector(`[data-cancel-fs="${classId}"]`).addEventListener("click", () => loadFeeStructures());
}

async function saveFeeStructure(classId) {
  const errorBox = document.getElementById("fs-error");
  errorBox.classList.remove("visible");

  const input = document.getElementById(`fs-input-${classId}`);
  const amount = Number(input.value);

  const { error } = await supabaseClient
    .from("fee_structures")
    .upsert(
      { academic_year_id: CURRENT_YEAR.id, class_id: classId, academic_fee: amount },
      { onConflict: "academic_year_id,class_id" }
    );

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  await loadFeeStructures();
}

// ---------- Student search ----------

function wireSearch() {
  document.getElementById("fee-search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("fee-search-input").value.trim();
    if (!q) return;

    const like = `%${q}%`;
    const { data, error } = await supabaseClient
      .from("students")
      .select("id, full_name, sats_number, admission_number")
      .or(`full_name.ilike.${like},sats_number.ilike.${like},admission_number.ilike.${like}`)
      .order("full_name")
      .limit(25);

    const container = document.getElementById("fee-search-results");

    if (error) {
      container.innerHTML = `<p class="field-hint">Search failed.</p>`;
      return;
    }

    if (!data.length) {
      container.innerHTML = `<p class="field-hint">No matches for "${escapeHtml(q)}".</p>`;
      return;
    }

    container.innerHTML = `
      <table style="margin-top:14px;">
        <thead><tr><th>Name</th><th>SATS Number</th><th></th></tr></thead>
        <tbody>
          ${data
            .map(
              (s) => `
                <tr>
                  <td>${escapeHtml(s.full_name)}</td>
                  <td>${escapeHtml(s.sats_number)}</td>
                  <td><a href="student-profile.html?id=${s.id}">Open profile →</a></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
