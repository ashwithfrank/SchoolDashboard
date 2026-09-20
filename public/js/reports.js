// ==========================================================
// Reports: pulls the same underlying data the rest of the app
// already uses (student_fee_summary-equivalent calculations,
// student_marks_summary) into filterable, exportable tables.
// Report types are limited to what the signed-in role can
// already see elsewhere (fee reports need fee access, the
// academic report needs academic access) — Reports itself has
// no separate permission, it just reuses the existing ones.
// ==========================================================

let CAN_VIEW_FEE_REPORTS = false;
let CAN_VIEW_ACADEMIC_REPORTS = false;
let ALL_YEARS = [];
let LAST_REPORT = null; // { title, headers, rows } — used for CSV export

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Reports";

  CAN_VIEW_FEE_REPORTS =
    permissionCodes.has("academic_fees.manage") ||
    permissionCodes.has("fee_reports.view") ||
    permissionCodes.has("fee_payments.record") ||
    permissionCodes.has("transport.manage");
  CAN_VIEW_ACADEMIC_REPORTS = permissionCodes.has("academic_reports.view") || permissionCodes.has("marks.manage");

  if (!CAN_VIEW_FEE_REPORTS && !CAN_VIEW_ACADEMIC_REPORTS) {
    document.getElementById("reports-content").innerHTML = `
      <div class="access-denied card">
        <h2>No report access</h2>
        <p>Your role doesn't include fee or academic reports. If you think this is wrong, ask an administrator.</p>
      </div>
    `;
    return;
  }

  const { data: years } = await supabaseClient.from("academic_years").select("id, label, is_current").order("start_date", { ascending: false });
  ALL_YEARS = years || [];

  if (!ALL_YEARS.length) {
    document.getElementById("reports-content").innerHTML = `
      <div class="empty-state card">
        <div class="empty-icon">📅</div>
        <h2>No academic years set up yet</h2>
        <p>Add one in <a href="settings.html">Settings</a> first.</p>
      </div>
    `;
    return;
  }

  document.getElementById("reports-content").innerHTML = pageHtml();
  wireControls();
  await onReportTypeChange();
})();

function pageHtml() {
  const reportOptions = [
    CAN_VIEW_FEE_REPORTS ? `<option value="student-fee">Student Fee Report</option>` : "",
    CAN_VIEW_FEE_REPORTS ? `<option value="class-fee">Class-wise Fee Report</option>` : "",
    CAN_VIEW_FEE_REPORTS ? `<option value="bus-fee">Bus-wise Fee Report</option>` : "",
    CAN_VIEW_ACADEMIC_REPORTS ? `<option value="academic">Student Academic Report</option>` : "",
  ].join("");

  const yearOptions = ALL_YEARS.map((y) => `<option value="${y.id}" ${y.is_current ? "selected" : ""}>${escapeHtml(y.label)}</option>`).join("");

  return `
    <div class="filter-bar card">
      <div class="field">
        <label for="report-type">Report</label>
        <select id="report-type">${reportOptions}</select>
      </div>
      <div class="field">
        <label for="report-year">Academic Year</label>
        <select id="report-year">${yearOptions}</select>
      </div>
      <div id="extra-filters" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;"></div>
      <button class="btn" id="run-report-btn">Run Report</button>
    </div>

    <div class="card">
      <div class="toolbar report-actions">
        <h3 id="report-title" style="margin:0;">—</h3>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="export-csv-btn">Export CSV</button>
          <button class="btn btn-secondary" id="print-btn">Print</button>
        </div>
      </div>
      <div class="report-title-print" id="report-title-print"></div>
      <div id="report-body"><p class="field-hint">Choose a report and click Run Report.</p></div>
    </div>
  `;
}

function wireControls() {
  document.getElementById("report-type").addEventListener("change", onReportTypeChange);
  document.getElementById("report-year").addEventListener("change", onReportTypeChange);
  document.getElementById("run-report-btn").addEventListener("click", runSelectedReport);
  document.getElementById("export-csv-btn").addEventListener("click", exportCsv);
  document.getElementById("print-btn").addEventListener("click", () => window.print());
}

async function onReportTypeChange() {
  const type = document.getElementById("report-type").value;
  const extra = document.getElementById("extra-filters");

  if (type === "student-fee") {
    const { data: classes } = await supabaseClient.from("classes").select("id, name").order("sort_order");
    extra.innerHTML = `
      <div class="field">
        <label for="filter-class">Class</label>
        <select id="filter-class"><option value="">All classes</option>${(classes || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label for="filter-status">Status</label>
        <select id="filter-status"><option value="">All</option><option value="pending">Has pending</option><option value="paid">Fully paid</option></select>
      </div>
    `;
  } else if (type === "academic") {
    const yearId = document.getElementById("report-year").value;
    const { data: exams } = await supabaseClient.from("exams").select("id, name, classes ( name )").eq("academic_year_id", yearId).order("exam_date");
    extra.innerHTML = `
      <div class="field">
        <label for="filter-exam">Exam</label>
        <select id="filter-exam">${(exams || []).map((e) => `<option value="${e.id}">${escapeHtml(e.name)} — ${escapeHtml(e.classes.name)}</option>`).join("") || `<option value="">No exams this year</option>`}</select>
      </div>
    `;
  } else {
    extra.innerHTML = "";
  }

  await runSelectedReport();
}

async function runSelectedReport() {
  const type = document.getElementById("report-type").value;
  const yearId = document.getElementById("report-year").value;
  const year = ALL_YEARS.find((y) => y.id === yearId);

  const body = document.getElementById("report-body");
  body.innerHTML = `<div class="loading-row">Loading…</div>`;

  if (type === "student-fee") await runStudentFeeReport(yearId, year);
  else if (type === "class-fee") await runClassFeeReport(yearId, year);
  else if (type === "bus-fee") await runBusFeeReport(yearId, year);
  else if (type === "academic") await runAcademicReport();
}

// ---------- Shared: pull the raw fee data for a year once ----------

async function fetchFeeRawData(yearId) {
  const [{ data: enroll }, { data: assignments }, { data: transport }, { data: payments }] = await Promise.all([
    supabaseClient
      .from("student_academic_records")
      .select("student_id, class_id, section_id, roll_number, classes ( name, sort_order ), sections ( name ), students ( full_name, sats_number )")
      .eq("academic_year_id", yearId)
      .eq("enrollment_status", "active"),
    supabaseClient.from("student_fee_assignments").select("student_id, academic_fee_applicable, discount_amount").eq("academic_year_id", yearId),
    supabaseClient
      .from("student_transport_assignments")
      .select("student_id, bus_id, bus_fee, buses ( bus_number )")
      .eq("academic_year_id", yearId)
      .eq("is_active", true),
    supabaseClient.from("fee_payments").select("student_id, fee_type, amount").eq("academic_year_id", yearId),
  ]);

  const assignmentByStudent = {};
  (assignments || []).forEach((a) => (assignmentByStudent[a.student_id] = a));

  const transportByStudent = {};
  (transport || []).forEach((t) => (transportByStudent[t.student_id] = t));

  const paidByStudent = {};
  (payments || []).forEach((p) => {
    const bucket = (paidByStudent[p.student_id] ||= { total: 0, academic: 0, bus: 0 });
    bucket.total += Number(p.amount) || 0;
    if (p.fee_type === "academic") bucket.academic += Number(p.amount) || 0;
    if (p.fee_type === "bus") bucket.bus += Number(p.amount) || 0;
  });

  return (enroll || [])
    .map((e) => {
      const fa = assignmentByStudent[e.student_id];
      if (!fa) return null; // no fee set up yet for this student
      const t = transportByStudent[e.student_id];
      const paid = paidByStudent[e.student_id] || { total: 0, academic: 0, bus: 0 };
      const academicFee = Number(fa.academic_fee_applicable) || 0;
      const busFee = t ? Number(t.bus_fee) || 0 : 0;
      const discount = Number(fa.discount_amount) || 0;
      const total = academicFee + busFee - discount;
      return {
        student_id: e.student_id,
        name: e.students.full_name,
        sats: e.students.sats_number,
        roll: e.roll_number,
        class_id: e.class_id,
        class_name: e.classes.name,
        class_sort: e.classes.sort_order,
        section_name: e.sections.name,
        bus_id: t ? t.bus_id : null,
        bus_number: t ? t.buses.bus_number : null,
        academicFee,
        busFee,
        discount,
        total,
        paid: paid.total,
        busPaid: paid.bus,
        pending: total - paid.total,
      };
    })
    .filter(Boolean);
}

// ---------- Student Fee Report ----------

async function runStudentFeeReport(yearId, year) {
  const rows = await fetchFeeRawData(yearId);
  const classFilter = document.getElementById("filter-class")?.value;
  const statusFilter = document.getElementById("filter-status")?.value;

  let filtered = rows;
  if (classFilter) filtered = filtered.filter((r) => r.class_id === classFilter);
  if (statusFilter === "pending") filtered = filtered.filter((r) => r.pending > 0);
  if (statusFilter === "paid") filtered = filtered.filter((r) => r.pending <= 0);

  filtered.sort((a, b) => a.class_sort - b.class_sort || a.name.localeCompare(b.name));

  const headers = ["Student", "SATS Number", "Class", "Section", "Academic Fee", "Bus Fee", "Discount", "Total", "Paid", "Pending"];
  const dataRows = filtered.map((r) => [
    r.name,
    r.sats,
    r.class_name,
    r.section_name,
    r.academicFee,
    r.busFee,
    r.discount,
    r.total,
    r.paid,
    r.pending,
  ]);

  renderReport(`Student Fee Report — ${year.label}`, headers, dataRows, [4, 5, 6, 7, 8, 9]);
}

// ---------- Class-wise Fee Report ----------

async function runClassFeeReport(yearId, year) {
  const rows = await fetchFeeRawData(yearId);
  const byClass = {};

  rows.forEach((r) => {
    const bucket = (byClass[r.class_id] ||= { name: r.class_name, sort: r.class_sort, total: 0, paid: 0, pending: 0, count: 0 });
    bucket.total += r.total;
    bucket.paid += r.paid;
    bucket.pending += r.pending;
    bucket.count += 1;
  });

  const sorted = Object.values(byClass).sort((a, b) => a.sort - b.sort);
  const headers = ["Class", "Students", "Total Fee", "Collected", "Pending"];
  const dataRows = sorted.map((c) => [c.name, c.count, c.total, c.paid, c.pending]);

  renderReport(`Class-wise Fee Report — ${year.label}`, headers, dataRows, [2, 3, 4]);
}

// ---------- Bus-wise Fee Report ----------

async function runBusFeeReport(yearId, year) {
  const rows = await fetchFeeRawData(yearId).then((all) => all.filter((r) => r.bus_id));
  const byBus = {};

  rows.forEach((r) => {
    const bucket = (byBus[r.bus_id] ||= { name: r.bus_number, due: 0, paid: 0, pending: 0, count: 0 });
    bucket.due += r.busFee;
    bucket.paid += r.busPaid;
    bucket.pending += r.busFee - r.busPaid;
    bucket.count += 1;
  });

  const sorted = Object.values(byBus).sort((a, b) => a.name.localeCompare(b.name));
  const headers = ["Bus", "Students", "Bus Fee Due", "Bus Fee Collected", "Bus Fee Pending"];
  const dataRows = sorted.map((b) => [b.name, b.count, b.due, b.paid, b.pending]);

  renderReport(`Bus-wise Fee Report — ${year.label}`, headers, dataRows, [2, 3, 4]);
}

// ---------- Student Academic Report ----------

async function runAcademicReport() {
  const examId = document.getElementById("filter-exam")?.value;

  if (!examId) {
    document.getElementById("report-body").innerHTML = `<p class="field-hint">No exams exist for this year yet.</p>`;
    document.getElementById("report-title").textContent = "Student Academic Report";
    LAST_REPORT = null;
    return;
  }

  const { data: exam } = await supabaseClient.from("exams").select("name, classes ( name )").eq("id", examId).maybeSingle();

  const { data, error } = await supabaseClient
    .from("student_marks_summary")
    .select("scored_marks, max_marks, min_marks, percentage, result, students ( full_name, sats_number ), subjects ( name )")
    .eq("exam_id", examId);

  if (error) {
    document.getElementById("report-body").innerHTML = `<p class="field-hint">Couldn't load this report.</p>`;
    return;
  }

  const rows = (data || []).sort((a, b) => a.students.full_name.localeCompare(b.students.full_name) || a.subjects.name.localeCompare(b.subjects.name));

  const headers = ["Student", "SATS Number", "Subject", "Scored", "Max", "Pass Mark", "Percentage", "Result"];
  const dataRows = rows.map((r) => [
    r.students.full_name,
    r.students.sats_number,
    r.subjects.name,
    r.scored_marks,
    r.max_marks,
    r.min_marks,
    r.percentage + "%",
    r.result,
  ]);

  renderReport(`Student Academic Report — ${exam.name} (${exam.classes.name})`, headers, dataRows, [3, 4, 5]);
}

// ---------- Rendering + export ----------

function renderReport(title, headers, dataRows, currencyColumns = []) {
  document.getElementById("report-title").textContent = title;
  document.getElementById("report-title-print").textContent = title;

  const body = document.getElementById("report-body");

  if (!dataRows.length) {
    body.innerHTML = `<p class="field-hint">No data for this report yet.</p>`;
    LAST_REPORT = { title, headers, rows: [] };
    return;
  }

  body.innerHTML = `
    <table>
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${dataRows
          .map(
            (row) => `
              <tr>
                ${row.map((cell, i) => `<td>${currencyColumns.includes(i) ? formatCurrency(cell) : escapeHtml(String(cell))}</td>`).join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;

  LAST_REPORT = { title, headers, rows: dataRows };
}

function exportCsv() {
  if (!LAST_REPORT || !LAST_REPORT.rows.length) {
    alert("Run a report with results first.");
    return;
  }

  const escapeCsvCell = (val) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [LAST_REPORT.headers.map(escapeCsvCell).join(",")];
  LAST_REPORT.rows.forEach((row) => lines.push(row.map(escapeCsvCell).join(",")));

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${LAST_REPORT.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
