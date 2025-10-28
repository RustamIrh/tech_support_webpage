// ✅ LOGIN.JS — connects to Firebase Auth and redirects to client-dashboard.html

import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const successMessage = document.getElementById("successMessage");
  const loginButton = document.getElementById("loginButton");

  // 👁️ Password toggle
  const toggle = document.createElement("span");
  toggle.textContent = "👁️";
  toggle.style.cursor = "pointer";
  toggle.style.marginLeft = "8px";
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

  // ✅ Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    emailError.textContent = "";
    passwordError.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      if (!email) emailError.textContent = "Email is required.";
      if (!password) passwordError.textContent = "Password is required.";
      return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    try {
      // 🔹 Firebase Authentication login
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // 🔹 Show success and redirect
      successMessage.style.display = "block";
      loginButton.textContent = "Sign In";

      setTimeout(() => {
        window.location.href = "client-dashboard.html"; // ✅ redirect to your real dashboard
      }, 1500);

    } catch (error) {
      console.error(error);
      loginButton.disabled = false;
      loginButton.textContent = "Sign In";

      // show readable errors
      if (error.code === "auth/user-not-found") {
        emailError.textContent = "No account found with that email.";
      } else if (error.code === "auth/wrong-password") {
        passwordError.textContent = "Incorrect password.";
      } else {
        passwordError.textContent = "Login failed. Try again.";
      }
    }
  });
});
