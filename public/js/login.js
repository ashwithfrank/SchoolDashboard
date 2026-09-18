// ==========================================================
// Login page logic
// ==========================================================

const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add("visible");
}

function hideError() {
  errorBox.classList.remove("visible");
}

// If already signed in, skip straight to the dashboard.
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = "dashboard.html";
  }
})();

// Surface a friendly message if we were redirected here because the
// signed-in auth user has no matching staff profile yet.
const params = new URLSearchParams(window.location.search);
if (params.get("error") === "no_profile") {
  showError(
    "Your login was recognized, but no staff account is linked to it yet. Ask an administrator to set up your profile."
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError(error.message || "Could not sign in. Check your email and password.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
    return;
  }

  window.location.href = "dashboard.html";
});
