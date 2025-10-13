document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const successMessage = document.getElementById("successMessage");
  const loginButton = document.getElementById("loginButton");

  // Create toggle icon dynamically
  const toggle = document.createElement("span");
  toggle.textContent = "👁️";
  toggle.style.cursor = "pointer";
  toggle.style.marginLeft = "8px";
  toggle.style.userSelect = "none";

  // Insert toggle icon right after the password input
  passwordInput.insertAdjacentElement("afterend", toggle);

  toggle.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      toggle.textContent = "🙈";
    } else {
      passwordInput.type = "password";
      toggle.textContent = "👁️";
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    let valid = true;

    if (!email) {
      emailError.textContent = "Email is required.";
      valid = false;
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      emailError.textContent = "Please enter a valid email.";
      valid = false;
    }

    if (!password) {
      passwordError.textContent = "Password is required.";
      valid = false;
    }

    if (!valid) return;

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    setTimeout(() => {
      successMessage.style.display = "block";
      loginButton.textContent = "Sign In";

      // Simulated redirect after success
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 2000);
    }, 1000);
  });
});
