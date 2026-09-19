// ==========================================================
// Student profile: Basic (view/edit), Academic history,
// Transport (view/assign/edit/remove), and Fees (view/setup/
// discount/record payment/history) are functional. Marks is a
// placeholder until Phase 5 ships.
// ==========================================================

let STUDENT_ID = null;
let CAN_EDIT_IDENTITY = false;
let CAN_MANAGE_STATUS = false;
let CAN_MANAGE_TRANSPORT = false;
let CAN_MANAGE_FEES = false;
let CAN_RECORD_PAYMENT = false;
let CAN_VIEW_FEES = false;
let CURRENT_USER_ID = null;
let STUDENT_DATA = null;
let CURRENT_YEAR = null;

(async () => {
  const { permissionCodes, session } = await initShell();
  document.getElementById("page-title").textContent = "Student Profile";

  CAN_EDIT_IDENTITY = permissionCodes.has("students.edit") || permissionCodes.has("students.manage");
  CAN_MANAGE_STATUS = permissionCodes.has("students.manage");
  CAN_MANAGE_TRANSPORT = permissionCodes.has("transport.manage");
  CAN_MANAGE_FEES = permissionCodes.has("academic_fees.manage");
  CAN_RECORD_PAYMENT = permissionCodes.has("fee_payments.record");
  CAN_VIEW_FEES = CAN_MANAGE_FEES || CAN_RECORD_PAYMENT || permissionCodes.has("fee_reports.view");
  CURRENT_USER_ID = session.user.id;

  const params = new URLSearchParams(window.location.search);
  STUDENT_ID = params.get("id");

  if (!STUDENT_ID) {
    document.getElementById("profile-area").innerHTML = `<div class="loading-row">No student specified.</div>`;
    return;
  }

  const { data: year } = await supabaseClient.from("academic_years").select("id, label").eq("is_current", true).maybeSingle();
  CURRENT_YEAR = year || null;

  wireTabs();
  await loadStudent();
  await loadAcademicHistory();
  await loadTransport();
  await loadFees();
})();

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

// ---------- Basic tab ----------

async function loadStudent() {
  const { data, error } = await supabaseClient.from("students").select("*").eq("id", STUDENT_ID).maybeSingle();

  if (error || !data) {
    document.getElementById("profile-area").innerHTML = `<div class="loading-row">Student not found, or you don't have access.</div>`;
    return;
  }

  STUDENT_DATA = data;
  document.getElementById("student-name-heading").textContent = data.full_name;
  document.getElementById("student-subheading").textContent = `SATS ${data.sats_number}`;
  renderBasicView();
}

function renderBasicView() {
  const s = STUDENT_DATA;
  const editButton = CAN_EDIT_IDENTITY ? `<button class="btn btn-secondary" id="edit-basic-btn">Edit</button>` : "";

  document.getElementById("panel-basic").innerHTML = `
    <div class="toolbar"><div>${statusBadge(s.status)}</div>${editButton}</div>
    <div class="form-grid">
      ${field("Full name", s.full_name)}
      ${field("SATS number", s.sats_number)}
      ${field("Admission number", s.admission_number || "—")}
      ${field("Gender", s.gender || "—")}
      ${field("Date of birth", s.date_of_birth || "—")}
      ${field("Father's name", s.father_name || "—")}
      ${field("Mother's name", s.mother_name || "—")}
      ${field("Contact number", s.contact_number || "—")}
    </div>
  `;

  const btn = document.getElementById("edit-basic-btn");
  if (btn) btn.addEventListener("click", renderBasicEditForm);
}

function field(label, value) {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="field-static">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderBasicEditForm() {
  const s = STUDENT_DATA;
  const statusControl = CAN_MANAGE_STATUS
    ? `
      <div class="field">
        <label for="edit-status">Status</label>
        <select id="edit-status">
          ${["active", "alumni", "transferred_out", "inactive"]
            .map((st) => `<option value="${st}" ${st === s.status ? "selected" : ""}>${st}</option>`)
            .join("")}
        </select>
      </div>
    `
    : "";

  document.getElementById("panel-basic").innerHTML = `
    <div class="form-error" id="basic-edit-error"></div>
    <form id="basic-edit-form">
      <div class="form-grid">
        <div class="field"><label for="edit-full_name">Full name</label><input type="text" id="edit-full_name" value="${attr(s.full_name)}" required /></div>
        <div class="field"><label for="edit-sats_number">SATS number</label><input type="text" id="edit-sats_number" value="${attr(s.sats_number)}" required /></div>
        <div class="field"><label for="edit-admission_number">Admission number</label><input type="text" id="edit-admission_number" value="${attr(s.admission_number || "")}" /></div>
        <div class="field">
          <label for="edit-gender">Gender</label>
          <select id="edit-gender">
            <option value="">—</option>
            <option value="male" ${s.gender === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${s.gender === "female" ? "selected" : ""}>Female</option>
            <option value="other" ${s.gender === "other" ? "selected" : ""}>Other</option>
          </select>
        </div>
        <div class="field"><label for="edit-date_of_birth">Date of birth</label><input type="date" id="edit-date_of_birth" value="${attr(s.date_of_birth || "")}" /></div>
        <div class="field"><label for="edit-father_name">Father's name</label><input type="text" id="edit-father_name" value="${attr(s.father_name || "")}" /></div>
        <div class="field"><label for="edit-mother_name">Mother's name</label><input type="text" id="edit-mother_name" value="${attr(s.mother_name || "")}" /></div>
        <div class="field"><label for="edit-contact_number">Contact number</label><input type="text" id="edit-contact_number" value="${attr(s.contact_number || "")}" /></div>
        ${statusControl}
      </div>
      <div class="form-actions">
        <button type="submit" class="btn" id="save-basic-btn">Save</button>
        <button type="button" class="btn btn-secondary" id="cancel-basic-btn">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById("cancel-basic-btn").addEventListener("click", renderBasicView);
  document.getElementById("basic-edit-form").addEventListener("submit", onSaveBasic);
}

async function onSaveBasic(event) {
  event.preventDefault();
  const errorBox = document.getElementById("basic-edit-error");
  errorBox.classList.remove("visible");

  const saveBtn = document.getElementById("save-basic-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const payload = {
    full_name: iv("edit-full_name"),
    sats_number: iv("edit-sats_number"),
    admission_number: iv("edit-admission_number") || null,
    gender: iv("edit-gender") || null,
    date_of_birth: iv("edit-date_of_birth") || null,
    father_name: iv("edit-father_name") || null,
    mother_name: iv("edit-mother_name") || null,
    contact_number: iv("edit-contact_number") || null,
  };

  if (CAN_MANAGE_STATUS) {
    const statusEl = document.getElementById("edit-status");
    if (statusEl) payload.status = statusEl.value;
  }

  const { data, error } = await supabaseClient
    .from("students")
    .update(payload)
    .eq("id", STUDENT_ID)
    .select("*")
    .single();

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
    return;
  }

  STUDENT_DATA = data;
  document.getElementById("student-name-heading").textContent = data.full_name;
  document.getElementById("student-subheading").textContent = `SATS ${data.sats_number}`;
  renderBasicView();
}

// ---------- Academic tab ----------

async function loadAcademicHistory() {
  const { data, error } = await supabaseClient
    .from("student_academic_records")
    .select("academic_year_id, roll_number, enrollment_status, academic_years ( label, is_current ), classes ( name ), sections ( name )")
    .eq("student_id", STUDENT_ID)
    .order("academic_year_id", { ascending: false });

  const panel = document.getElementById("panel-academic");

  if (error) {
    panel.innerHTML = `<div class="loading-row">Couldn't load academic history.</div>`;
    return;
  }

  if (!data.length) {
    panel.innerHTML = `<p class="field-hint">No academic enrollment on record yet.</p>`;
    return;
  }

  panel.innerHTML = `
    <table>
      <thead><tr><th>Academic Year</th><th>Class</th><th>Section</th><th>Roll No.</th><th>Status</th></tr></thead>
      <tbody>
        ${data
          .map(
            (r) => `
              <tr>
                <td>${escapeHtml(r.academic_years.label)} ${r.academic_years.is_current ? '<span class="badge badge-success" style="margin-left:6px;">Current</span>' : ""}</td>
                <td>${escapeHtml(r.classes.name)}</td>
                <td>${escapeHtml(r.sections.name)}</td>
                <td>${r.roll_number ? escapeHtml(r.roll_number) : "—"}</td>
                <td><span class="badge badge-neutral">${escapeHtml(r.enrollment_status)}</span></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ---------- Transport tab ----------

async function loadTransport() {
  const panel = document.getElementById("panel-transport");

  if (!CURRENT_YEAR) {
    panel.innerHTML = `<p class="field-hint">No current academic year set — an administrator needs to set one in Settings first.</p>`;
    return;
  }

  if (!CAN_MANAGE_TRANSPORT) {
    panel.innerHTML = `<p class="field-hint">Transport details aren't visible to your role.</p>`;
    return;
  }

  const { data, error } = await supabaseClient
    .from("student_transport_assignments")
    .select("id, bus_id, location, distance_km, bus_fee, buses ( bus_number )")
    .eq("student_id", STUDENT_ID)
    .eq("academic_year_id", CURRENT_YEAR.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    panel.innerHTML = `<p class="field-hint">Couldn't load transport details.</p>`;
    return;
  }

  if (!data) {
    renderTransportAssignForm(null);
    return;
  }

  renderTransportView(data);
}

function renderTransportView(assignment) {
  document.getElementById("panel-transport").innerHTML = `
    <div class="toolbar"><div></div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="edit-transport-btn">Edit</button>
        <button class="btn btn-danger" id="remove-transport-btn">Remove from bus</button>
      </div>
    </div>
    <div class="form-grid">
      ${field("Bus", escapeHtml(assignment.buses.bus_number))}
      ${field("Location", assignment.location ? escapeHtml(assignment.location) : "—")}
      ${field("Distance", assignment.distance_km != null ? assignment.distance_km + " km" : "—")}
      ${field("Bus fee (this year)", formatCurrency(assignment.bus_fee))}
    </div>
  `;

  document.getElementById("edit-transport-btn").addEventListener("click", () => renderTransportAssignForm(assignment));
  document.getElementById("remove-transport-btn").addEventListener("click", () => removeTransport(assignment.id));
}

async function renderTransportAssignForm(existing) {
  const { data: buses } = await supabaseClient
    .from("buses")
    .select("id, bus_number")
    .eq("is_active", true)
    .order("bus_number");

  const busOptions = (buses || [])
    .map(
      (b) =>
        `<option value="${b.id}" ${existing && existing.bus_id === b.id ? "selected" : ""}>${escapeHtml(b.bus_number)}</option>`
    )
    .join("");

  document.getElementById("panel-transport").innerHTML = `
    ${existing ? "" : `<p class="field-hint" style="margin-bottom:14px;">No bus assigned for ${escapeHtml(CURRENT_YEAR.label)} yet.</p>`}
    <div class="form-error" id="transport-error"></div>
    <form id="transport-form">
      <div class="form-grid">
        <div class="field">
          <label for="t-bus">Bus *</label>
          <select id="t-bus" required><option value="">Select a bus…</option>${busOptions}</select>
        </div>
        <div class="field">
          <label for="t-location">Location</label>
          <input type="text" id="t-location" value="${existing ? attr(existing.location || "") : ""}" />
        </div>
        <div class="field">
          <label for="t-distance">Distance (km)</label>
          <input type="number" step="0.1" min="0" id="t-distance" value="${existing && existing.distance_km != null ? existing.distance_km : ""}" />
        </div>
        <div class="field">
          <label for="t-fee">Bus fee (this year) *</label>
          <input type="number" step="1" min="0" id="t-fee" value="${existing ? existing.bus_fee : ""}" required />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn" id="save-transport-btn">${existing ? "Save changes" : "Assign to bus"}</button>
        ${existing ? `<button type="button" class="btn btn-secondary" id="cancel-transport-btn">Cancel</button>` : ""}
      </div>
    </form>
  `;

  if (existing) {
    document.getElementById("cancel-transport-btn").addEventListener("click", () => renderTransportView(existing));
  }
  document.getElementById("transport-form").addEventListener("submit", (e) => onSaveTransport(e, existing));
}

async function onSaveTransport(event, existing) {
  event.preventDefault();
  const errorBox = document.getElementById("transport-error");
  errorBox.classList.remove("visible");

  const saveBtn = document.getElementById("save-transport-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const distanceVal = document.getElementById("t-distance").value.trim();

  const payload = {
    bus_id: document.getElementById("t-bus").value,
    location: document.getElementById("t-location").value.trim() || null,
    distance_km: distanceVal ? Number(distanceVal) : null,
    bus_fee: Number(document.getElementById("t-fee").value),
  };

  const query = existing
    ? supabaseClient.from("student_transport_assignments").update(payload).eq("id", existing.id)
    : supabaseClient
        .from("student_transport_assignments")
        .insert({ ...payload, student_id: STUDENT_ID, academic_year_id: CURRENT_YEAR.id });

  const { error } = await query;

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    saveBtn.disabled = false;
    saveBtn.textContent = existing ? "Save changes" : "Assign to bus";
    return;
  }

  await loadTransport();
}

async function removeTransport(assignmentId) {
  if (!confirm("Remove this student from their assigned bus for the current year?")) return;

  const { error } = await supabaseClient.from("student_transport_assignments").delete().eq("id", assignmentId);

  if (error) {
    alert(`Couldn't remove the assignment: ${error.message}`);
    return;
  }

  await loadTransport();
}

// ---------- Fees tab ----------

async function loadFees() {
  const panel = document.getElementById("panel-fees");

  if (!CURRENT_YEAR) {
    panel.innerHTML = `<p class="field-hint">No current academic year set — an administrator needs to set one in Settings first.</p>`;
    return;
  }

  if (!CAN_VIEW_FEES) {
    panel.innerHTML = `<p class="field-hint">Fee details aren't visible to your role.</p>`;
    return;
  }

  const { data: assignment, error } = await supabaseClient
    .from("student_fee_assignments")
    .select("id, fee_structure_id, academic_fee_applicable, discount_amount, notes")
    .eq("student_id", STUDENT_ID)
    .eq("academic_year_id", CURRENT_YEAR.id)
    .maybeSingle();

  if (error) {
    panel.innerHTML = `<p class="field-hint">Couldn't load fee details.</p>`;
    return;
  }

  if (!assignment) {
    await renderFeeSetup();
    return;
  }

  await renderFeeView(assignment);
}

async function renderFeeSetup() {
  const panel = document.getElementById("panel-fees");

  if (!CAN_MANAGE_FEES) {
    panel.innerHTML = `<p class="field-hint">No fees have been set up for this student for ${escapeHtml(CURRENT_YEAR.label)} yet. An administrator or office staff member needs to set this up.</p>`;
    return;
  }

  // Look up this student's current class to suggest the class fee structure.
  const { data: enrollment } = await supabaseClient
    .from("student_academic_records")
    .select("class_id")
    .eq("student_id", STUDENT_ID)
    .eq("academic_year_id", CURRENT_YEAR.id)
    .maybeSingle();

  let suggestedFee = "";
  let feeStructureId = null;
  if (enrollment) {
    const { data: fs } = await supabaseClient
      .from("fee_structures")
      .select("id, academic_fee")
      .eq("academic_year_id", CURRENT_YEAR.id)
      .eq("class_id", enrollment.class_id)
      .maybeSingle();
    if (fs) {
      suggestedFee = fs.academic_fee;
      feeStructureId = fs.id;
    }
  }

  panel.innerHTML = `
    <p class="field-hint" style="margin-bottom:14px;">No fees set up for ${escapeHtml(CURRENT_YEAR.label)} yet.</p>
    ${!feeStructureId ? `<p class="form-error visible">No fee structure is set for this student's class yet — set one in <a href="fees.html">Fee Collection</a> first, or enter an amount manually below.</p>` : ""}
    <div class="form-error" id="fee-setup-error"></div>
    <form id="fee-setup-form">
      <div class="form-grid">
        <div class="field">
          <label for="setup-academic-fee">Academic fee *</label>
          <input type="number" min="0" step="1" id="setup-academic-fee" value="${suggestedFee}" required />
        </div>
        <div class="field">
          <label for="setup-discount">Discount</label>
          <input type="number" min="0" step="1" id="setup-discount" value="0" />
        </div>
        <div class="field field-wide">
          <label for="setup-notes">Notes</label>
          <input type="text" id="setup-notes" />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn" id="setup-save-btn">Set up fees</button>
      </div>
    </form>
  `;

  document.getElementById("fee-setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("fee-setup-error");
    errorBox.classList.remove("visible");

    if (!feeStructureId) {
      errorBox.textContent = "No fee structure exists for this class/year yet — set one up in Fee Collection first.";
      errorBox.classList.add("visible");
      return;
    }

    const btn = document.getElementById("setup-save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    const { error } = await supabaseClient.from("student_fee_assignments").insert({
      student_id: STUDENT_ID,
      academic_year_id: CURRENT_YEAR.id,
      fee_structure_id: feeStructureId,
      academic_fee_applicable: Number(document.getElementById("setup-academic-fee").value),
      discount_amount: Number(document.getElementById("setup-discount").value) || 0,
      notes: document.getElementById("setup-notes").value.trim() || null,
    });

    if (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Set up fees";
      return;
    }

    await loadFees();
  });
}

async function renderFeeView(assignment) {
  const panel = document.getElementById("panel-fees");

  const [{ data: summary }, { data: payments, error: payError }] = await Promise.all([
    supabaseClient
      .from("student_fee_summary")
      .select("academic_fee_applicable, bus_fee_applicable, discount_amount, total_fee, total_paid, pending")
      .eq("student_id", STUDENT_ID)
      .eq("academic_year_id", CURRENT_YEAR.id)
      .maybeSingle(),
    supabaseClient
      .from("fee_payments")
      .select("id, fee_type, amount, payment_date, notes, profiles ( full_name )")
      .eq("student_id", STUDENT_ID)
      .eq("academic_year_id", CURRENT_YEAR.id)
      .order("payment_date", { ascending: false }),
  ]);

  const editButton = CAN_MANAGE_FEES ? `<button class="btn btn-secondary" id="edit-fee-btn">Edit discount</button>` : "";

  panel.innerHTML = `
    <div class="toolbar"><div></div>${editButton}</div>
    <div class="form-grid" style="margin-bottom:24px;">
      ${field("Academic fee", formatCurrency(summary?.academic_fee_applicable))}
      ${field("Bus fee", formatCurrency(summary?.bus_fee_applicable))}
      ${field("Discount", formatCurrency(summary?.discount_amount))}
      ${field("Total", formatCurrency(summary?.total_fee))}
      ${field("Paid", formatCurrency(summary?.total_paid))}
      ${field("Pending", formatCurrency(summary?.pending))}
    </div>

    ${CAN_RECORD_PAYMENT ? recordPaymentFormHtml() : ""}

    <h3 style="margin:22px 0 10px;">Payment History</h3>
    <div id="payment-history">${paymentHistoryHtml(payments, payError)}</div>
  `;

  const editBtn = document.getElementById("edit-fee-btn");
  if (editBtn) editBtn.addEventListener("click", () => renderDiscountEditForm(assignment));

  const payForm = document.getElementById("record-payment-form");
  if (payForm) payForm.addEventListener("submit", onRecordPayment);
}

function paymentHistoryHtml(payments, error) {
  if (error) return `<p class="field-hint">Couldn't load payment history.</p>`;
  if (!payments || !payments.length) return `<p class="field-hint">No payments recorded yet.</p>`;

  return `
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Notes</th><th>Recorded By</th></tr></thead>
      <tbody>
        ${payments
          .map(
            (p) => `
              <tr>
                <td>${escapeHtml(p.payment_date)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(p.fee_type)}</span></td>
                <td>${formatCurrency(p.amount)}</td>
                <td>${p.notes ? escapeHtml(p.notes) : "—"}</td>
                <td>${p.profiles ? escapeHtml(p.profiles.full_name) : "—"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function recordPaymentFormHtml() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="section-block">
      <h3>Record a Payment</h3>
      <div class="form-error" id="payment-error"></div>
      <form id="record-payment-form">
        <div class="form-grid">
          <div class="field">
            <label for="pay-type">Fee type *</label>
            <select id="pay-type" required>
              <option value="academic">Academic</option>
              <option value="bus">Bus</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="field">
            <label for="pay-amount">Amount *</label>
            <input type="number" min="1" step="1" id="pay-amount" required />
          </div>
          <div class="field">
            <label for="pay-date">Payment date *</label>
            <input type="date" id="pay-date" value="${today}" required />
          </div>
          <div class="field field-wide">
            <label for="pay-notes">Notes</label>
            <input type="text" id="pay-notes" />
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn" id="record-payment-btn">Record Payment</button>
        </div>
      </form>
    </div>
  `;
}

async function onRecordPayment(event) {
  event.preventDefault();
  const errorBox = document.getElementById("payment-error");
  errorBox.classList.remove("visible");

  const btn = document.getElementById("record-payment-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const { error } = await supabaseClient.from("fee_payments").insert({
    student_id: STUDENT_ID,
    academic_year_id: CURRENT_YEAR.id,
    fee_type: document.getElementById("pay-type").value,
    amount: Number(document.getElementById("pay-amount").value),
    payment_date: document.getElementById("pay-date").value,
    notes: document.getElementById("pay-notes").value.trim() || null,
    recorded_by: CURRENT_USER_ID,
  });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    btn.disabled = false;
    btn.textContent = "Record Payment";
    return;
  }

  await loadFees();
}

function renderDiscountEditForm(assignment) {
  const panel = document.getElementById("panel-fees");
  panel.innerHTML = `
    <div class="form-error" id="discount-edit-error"></div>
    <form id="discount-edit-form">
      <div class="form-grid">
        <div class="field">
          <label for="edit-academic-fee">Academic fee</label>
          <input type="number" min="0" step="1" id="edit-academic-fee" value="${assignment.academic_fee_applicable}" required />
        </div>
        <div class="field">
          <label for="edit-discount">Discount</label>
          <input type="number" min="0" step="1" id="edit-discount" value="${assignment.discount_amount}" />
        </div>
        <div class="field field-wide">
          <label for="edit-fee-notes">Notes</label>
          <input type="text" id="edit-fee-notes" value="${attr(assignment.notes || "")}" />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn" id="save-discount-btn">Save</button>
        <button type="button" class="btn btn-secondary" id="cancel-discount-btn">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById("cancel-discount-btn").addEventListener("click", loadFees);
  document.getElementById("discount-edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("discount-edit-error");
    errorBox.classList.remove("visible");

    const btn = document.getElementById("save-discount-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    const { error } = await supabaseClient
      .from("student_fee_assignments")
      .update({
        academic_fee_applicable: Number(document.getElementById("edit-academic-fee").value),
        discount_amount: Number(document.getElementById("edit-discount").value) || 0,
        notes: document.getElementById("edit-fee-notes").value.trim() || null,
      })
      .eq("id", assignment.id);

    if (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Save";
      return;
    }

    await loadFees();
  });
}

// ---------- Helpers ----------

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function statusBadge(status) {
  const map = {
    active: "badge-success",
    alumni: "badge-neutral",
    transferred_out: "badge-warning",
    inactive: "badge-danger",
  };
  return `<span class="badge ${map[status] || "badge-neutral"}">${escapeHtml(status)}</span>`;
}

function iv(id) {
  return document.getElementById(id).value.trim();
}

function attr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
