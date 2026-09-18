// ==========================================================
// Dashboard: live summary cards.
// Every number here is a real query, filtered by RLS to whatever
// the signed-in role is allowed to see — nothing is hardcoded,
// and a role with no fee/academic permission simply sees "—"
// for the cards it can't query rather than an error.
// ==========================================================

(async () => {
  const { permissionCodes } = await initShell();

  document.getElementById("page-title").textContent = "Dashboard";

  await loadCoreCounts();
  await loadCurrentAcademicYear();

  if (hasAny(["academic_fees.manage", "fee_reports.view"])) {
    await loadFeeSummary();
  } else {
    setCardUnavailable("fee-collected", "No fee access for this role");
    setCardUnavailable("fee-pending", "No fee access for this role");
  }

  function hasAny(codes) {
    return codes.some((c) => permissionCodes.has(c));
  }
})();

function setStat(id, value, sub) {
  const valueEl = document.getElementById(id);
  if (valueEl) valueEl.textContent = value;
  if (sub) {
    const subEl = document.getElementById(id + "-sub");
    if (subEl) subEl.textContent = sub;
  }
}

function setCardUnavailable(id, message) {
  setStat(id, "—", message);
}

async function loadCoreCounts() {
  const [studentsRes, classesRes, employeesRes, busesRes] = await Promise.all([
    supabaseClient.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseClient.from("classes").select("id", { count: "exact", head: true }),
    supabaseClient.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseClient.from("buses").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  setStat("stat-students", studentsRes.count ?? 0, "Active students");
  setStat("stat-classes", classesRes.count ?? 0, "LKG through Class 10");
  setStat("stat-employees", employeesRes.count ?? 0, "Active staff");
  setStat("stat-buses", busesRes.count ?? 0, "Active buses");
}

async function loadCurrentAcademicYear() {
  const { data, error } = await supabaseClient
    .from("academic_years")
    .select("label")
    .eq("is_current", true)
    .maybeSingle();

  if (error || !data) {
    setStat("stat-year", "Not set", "Set the current year in Settings");
    return;
  }
  setStat("stat-year", data.label, "Current academic year");
}

async function loadFeeSummary() {
  const { data: year } = await supabaseClient
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (!year) {
    setCardUnavailable("fee-collected", "No current academic year set");
    setCardUnavailable("fee-pending", "No current academic year set");
    return;
  }

  const { data: rows, error } = await supabaseClient
    .from("student_fee_summary")
    .select("total_fee, total_paid, pending")
    .eq("academic_year_id", year.id);

  if (error) {
    setCardUnavailable("fee-collected", "Unable to load");
    setCardUnavailable("fee-pending", "Unable to load");
    return;
  }

  const totals = (rows || []).reduce(
    (acc, r) => {
      acc.fee += Number(r.total_fee) || 0;
      acc.paid += Number(r.total_paid) || 0;
      acc.pending += Number(r.pending) || 0;
      return acc;
    },
    { fee: 0, paid: 0, pending: 0 }
  );

  setStat("fee-collected", formatCurrency(totals.paid), `of ${formatCurrency(totals.fee)} total`);
  setStat("fee-pending", formatCurrency(totals.pending), "Outstanding this year");
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
