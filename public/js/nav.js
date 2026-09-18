// ==========================================================
// Shared shell logic for every protected page:
//  - redirects to login.html if there's no session
//  - loads the current user's profile + permission codes
//  - renders the sidebar, filtered to what the role can see
//  - wires up logout and the mobile menu toggle
//
// Include this after supabase-client.js on any page that has
// <div id="sidebar-root"></div> and <div id="user-box"></div>.
// ==========================================================

const NAV_ITEMS = [
  { href: "dashboard.html", label: "Dashboard", perms: null }, // null = always visible
  { href: "students.html", label: "Students", perms: null },
  { href: "employees.html", label: "Employees", perms: ["employees.manage"] },
  { href: "buses.html", label: "Buses", perms: null },
  { href: "fees.html", label: "Fee Collection", perms: ["academic_fees.manage", "transport.manage", "fee_payments.record", "fee_reports.view"] },
  { href: "academics.html", label: "Academics", perms: ["subjects.manage", "exams.manage", "marks.manage", "academic_reports.view"] },
  { href: "reports.html", label: "Reports", perms: null },
  { href: "audit-logs.html", label: "Audit Logs", perms: ["audit_logs.view"] },
  { href: "settings.html", label: "Settings", perms: ["staff_accounts.manage", "academic_years.manage", "classes_sections.manage"] },
];

/**
 * Ensures a signed-in session exists and returns { session, profile, permissionCodes }.
 * Redirects to login.html and never resolves if there's no session.
 */
async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return new Promise(() => {}); // never resolves; we're navigating away
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, is_active, role_id, roles ( name )")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    // Signed in with Supabase Auth, but no active profile row yet.
    await supabase.auth.signOut();
    window.location.href = "login.html?error=no_profile";
    return new Promise(() => {});
  }

  const { data: permRows } = await supabase
    .from("role_permissions")
    .select("permissions ( code )")
    .eq("role_id", profile.role_id);

  const permissionCodes = new Set((permRows || []).map((r) => r.permissions.code));

  return { session, profile, permissionCodes };
}

function roleLabel(roleName) {
  switch (roleName) {
    case "admin": return "Administrator";
    case "office_staff": return "Office Staff";
    case "teaching_staff": return "Teaching Staff";
    default: return roleName;
  }
}

function renderSidebar(profile, permissionCodes) {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.perms) return true;
    return item.perms.some((code) => permissionCodes.has(code));
  });

  const linksHtml = visibleItems
    .map((item) => {
      const activeClass = item.href === currentPage ? " active" : "";
      return `<a href="${item.href}" class="${activeClass.trim()}">${item.label}</a>`;
    })
    .join("");

  const sidebarRoot = document.getElementById("sidebar-root");
  if (sidebarRoot) {
    sidebarRoot.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          School Staff Dashboard
          <small>Administration</small>
        </div>
        <nav>${linksHtml}</nav>
        <div class="sidebar-footer">
          <div class="user-name">${escapeHtml(profile.full_name)}</div>
          <div class="user-role">${roleLabel(profile.roles.name)}</div>
          <button class="btn btn-secondary btn-block" id="logout-btn" type="button">Log out</button>
        </div>
      </aside>
    `;
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "login.html";
    });
  }

  const menuToggle = document.getElementById("menu-toggle");
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/**
 * Call this at the top of every protected page's own script.
 * Resolves with { session, profile, permissionCodes } once the
 * sidebar has been rendered.
 */
async function initShell() {
  const { session, profile, permissionCodes } = await requireSession();
  renderSidebar(profile, permissionCodes);
  return { session, profile, permissionCodes };
}
