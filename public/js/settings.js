// ==========================================================
// Settings: Academic Years + Classes/Sections management.
// Admin-only in practice (RLS enforces it regardless), so this
// page checks permissions up front and shows a plain access
// message instead of a broken form if someone lands here without
// the right role.
// ==========================================================

let CAN_MANAGE_YEARS = false;
let CAN_MANAGE_CLASSES = false;

(async () => {
  const { permissionCodes } = await initShell();
  document.getElementById("page-title").textContent = "Settings";

  CAN_MANAGE_YEARS = permissionCodes.has("academic_years.manage");
  CAN_MANAGE_CLASSES = permissionCodes.has("classes_sections.manage");

  if (!CAN_MANAGE_YEARS && !CAN_MANAGE_CLASSES) {
    document.getElementById("settings-content").innerHTML = `
      <div class="access-denied card">
        <h2>No settings access</h2>
        <p>Your role doesn't include settings management. If you think this is wrong, ask an administrator.</p>
      </div>
    `;
    return;
  }

  document.getElementById("settings-content").innerHTML = `
    ${CAN_MANAGE_YEARS ? academicYearsSectionHtml() : ""}
    ${CAN_MANAGE_CLASSES ? classesSectionHtml() : ""}
  `;

  if (CAN_MANAGE_YEARS) {
    await loadAcademicYears();
    document.getElementById("add-year-form").addEventListener("submit", onAddYear);
  }
  if (CAN_MANAGE_CLASSES) {
    await loadClassesAndSections();
  }
})();

function academicYearsSectionHtml() {
  return `
    <div class="card section-block">
      <h3>Academic Years</h3>
      <p class="field-hint" style="margin-bottom:14px;">Only one year can be current at a time — setting a new one automatically unsets the old one.</p>
      <div id="year-error" class="form-error"></div>
      <table>
        <thead><tr><th>Label</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
        <tbody id="years-tbody"><tr><td colspan="5" class="loading-row">Loading…</td></tr></tbody>
      </table>
      <div class="inline-form-row" style="margin-top:18px;">
        <form id="add-year-form" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
          <div class="field">
            <label for="year-label">Label</label>
            <input type="text" id="year-label" placeholder="2026-27" required />
          </div>
          <div class="field">
            <label for="year-start">Start date</label>
            <input type="date" id="year-start" required />
          </div>
          <div class="field">
            <label for="year-end">End date</label>
            <input type="date" id="year-end" required />
          </div>
          <button type="submit" class="btn">Add year</button>
        </form>
      </div>
    </div>
  `;
}

function classesSectionHtml() {
  return `
    <div class="card section-block">
      <h3>Classes &amp; Sections</h3>
      <p class="field-hint" style="margin-bottom:14px;">Sections belong to a class and carry over year to year — retire one instead of deleting it once it's been used.</p>
      <div id="section-error" class="form-error"></div>
      <div id="classes-list"><div class="loading-row">Loading…</div></div>
    </div>
  `;
}

// ---------- Academic years ----------

async function loadAcademicYears() {
  const { data, error } = await supabaseClient
    .from("academic_years")
    .select("id, label, start_date, end_date, is_current")
    .order("start_date", { ascending: false });

  const tbody = document.getElementById("years-tbody");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Couldn't load academic years.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">No academic years yet — add one below.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (y) => `
        <tr>
          <td>${escapeHtml(y.label)}</td>
          <td>${y.start_date}</td>
          <td>${y.end_date}</td>
          <td>${
            y.is_current
              ? `<span class="badge badge-success">Current</span>`
              : `<span class="badge badge-neutral">—</span>`
          }</td>
          <td>${
            y.is_current
              ? ""
              : `<button class="text-btn" data-set-current="${y.id}">Set as current</button>`
          }</td>
        </tr>
      `
    )
    .join("");

  tbody.querySelectorAll("[data-set-current]").forEach((btn) => {
    btn.addEventListener("click", () => setCurrentYear(btn.dataset.setCurrent));
  });
}

async function onAddYear(event) {
  event.preventDefault();
  const errorBox = document.getElementById("year-error");
  errorBox.classList.remove("visible");

  const label = document.getElementById("year-label").value.trim();
  const start_date = document.getElementById("year-start").value;
  const end_date = document.getElementById("year-end").value;

  const { error } = await supabaseClient.from("academic_years").insert({ label, start_date, end_date });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  document.getElementById("add-year-form").reset();
  await loadAcademicYears();
}

async function setCurrentYear(yearId) {
  const errorBox = document.getElementById("year-error");
  errorBox.classList.remove("visible");

  const { error } = await supabaseClient.rpc("set_current_academic_year", { target_year_id: yearId });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }
  await loadAcademicYears();
}

// ---------- Classes & sections ----------

async function loadClassesAndSections() {
  const [classesRes, sectionsRes] = await Promise.all([
    supabaseClient.from("classes").select("id, name, sort_order").order("sort_order"),
    supabaseClient.from("sections").select("id, class_id, name, is_active").order("sort_order"),
  ]);

  const container = document.getElementById("classes-list");

  if (classesRes.error || sectionsRes.error) {
    container.innerHTML = `<div class="loading-row">Couldn't load classes/sections.</div>`;
    return;
  }

  const sectionsByClass = {};
  (sectionsRes.data || []).forEach((s) => {
    (sectionsByClass[s.class_id] ||= []).push(s);
  });

  container.innerHTML = classesRes.data
    .map((c) => {
      const sections = sectionsByClass[c.id] || [];
      const sectionChips = sections.length
        ? sections
            .map(
              (s) => `
                <span class="badge ${s.is_active ? "badge-neutral" : "badge-warning"}" style="margin:0 6px 6px 0; display:inline-flex; gap:8px;">
                  ${escapeHtml(s.name)}
                  <button class="text-btn ${s.is_active ? "danger" : ""}" style="font-size:11px;" data-toggle-section="${s.id}" data-active="${s.is_active}">
                    ${s.is_active ? "Retire" : "Reactivate"}
                  </button>
                </span>
              `
            )
            .join("")
        : `<span class="field-hint">No sections yet.</span>`;

      return `
        <div style="padding:12px 0; border-bottom:1px solid var(--color-border);">
          <div style="font-weight:600; margin-bottom:8px;">${escapeHtml(c.name)}</div>
          <div style="margin-bottom:8px;">${sectionChips}</div>
          <form class="inline-form-row" style="margin-bottom:0;" data-add-section-for="${c.id}">
            <div class="field">
              <input type="text" placeholder="New section name (e.g. C)" maxlength="10" required />
            </div>
            <button type="submit" class="btn btn-secondary">Add section</button>
          </form>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-toggle-section]").forEach((btn) => {
    btn.addEventListener("click", () =>
      toggleSection(btn.dataset.toggleSection, btn.dataset.active === "true")
    );
  });

  container.querySelectorAll("form[data-add-section-for]").forEach((form) => {
    form.addEventListener("submit", (e) => onAddSection(e, form.dataset.addSectionFor));
  });
}

async function onAddSection(event, classId) {
  event.preventDefault();
  const input = event.target.querySelector("input");
  const name = input.value.trim();
  if (!name) return;

  const errorBox = document.getElementById("section-error");
  errorBox.classList.remove("visible");

  const { error } = await supabaseClient.from("sections").insert({ class_id: classId, name });

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  await loadClassesAndSections();
}

async function toggleSection(sectionId, currentlyActive) {
  const errorBox = document.getElementById("section-error");
  errorBox.classList.remove("visible");

  const { error } = await supabaseClient
    .from("sections")
    .update({ is_active: !currentlyActive })
    .eq("id", sectionId);

  if (error) {
    errorBox.textContent = error.message;
    errorBox.classList.add("visible");
    return;
  }

  await loadClassesAndSections();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
