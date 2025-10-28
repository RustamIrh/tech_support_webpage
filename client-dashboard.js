import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc // ✅ added comma here (fixed syntax)
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js";

let currentUser = null;

// ✅ Listen for login state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("userName").textContent =
      user.displayName || user.email;

    // 🔹 Get elements from the HTML (plan info box)
    const planTypeEl = document.getElementById("planType");
    const visitsRemainingEl = document.getElementById("visitsRemaining");

    // 🔹 Get this user's Firestore document
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // 🔹 If document exists, show plan info
    if (userSnap.exists()) {
      const data = userSnap.data();
      planTypeEl.textContent = data.planType || "No plan";
      visitsRemainingEl.textContent =
        typeof data.visitsRemaining === "number" ? data.visitsRemaining : "0";
    } else {
      planTypeEl.textContent = "No plan found";
      visitsRemainingEl.textContent = "0";
    }

    // ✅ Load appointments after showing plan info
    loadAppointments();
  } else {
    window.location.href = "client.html";
  }
});

// ✅ Function to load appointments
async function loadAppointments() {
  const q = query(
    collection(db, "appointments"), // ✅ make sure your collection is lowercase "appointments"
    where("clientEmail", "==", currentUser.email),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snapshot) => {
    const tbody = document.querySelector(".appointments-table tbody");
    if (!tbody) return; // ✅ prevents errors if the table isn't on the page yet
    tbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Badge colors
      const statusClass =
        data.status === "Completed"
          ? "badge-success"
          : data.status === "Pending"
          ? "badge-warning"
          : data.status === "Cancelled"
          ? "badge-danger"
          : "badge-primary";

      // Cancel button logic
      const canCancel = data.status === "Pending";
      const cancelBtnClass = canCancel ? "btn-danger" : "btn-secondary";
      const cancelBtnText = canCancel ? "Cancel" : "Cancel (Disabled)";
      const disabledAttr = canCancel ? "" : "disabled";

      // Add row
      tbody.innerHTML += `
        <tr>
          <td>${data.serviceType}</td>
          <td>${data.preferredDate}</td>
          <td>${data.assignedWorker || "-"}</td>
          <td><span class="badge ${statusClass}">${data.status}</span></td>
          <td>
            <button class="btn btn-sm ${cancelBtnClass}" 
                    ${disabledAttr} 
                    data-id="${docSnap.id}">
              ${cancelBtnText}
            </button>
          </td>
        </tr>
      `;
    });

    // ✅ Handle Cancel button clicks
    document.querySelectorAll(".btn-danger").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const confirm = await Swal.fire({
          title: "Cancel appointment?",
          text: "Are you sure you want to cancel this appointment?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, cancel it!",
        });

        if (confirm.isConfirmed) {
          await updateDoc(doc(db, "appointments", id), { status: "Cancelled" });
          Swal.fire("Cancelled!", "Your appointment has been cancelled.", "success");
        }
      });
    });
  });
}

// ✅ Schedule new appointment
const newAppointmentBtn = docum
