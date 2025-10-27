import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const appointmentsTableBody = document.querySelector(".appointments-table tbody");

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("✅ Logged in as:", user.email);
    loadWorkerAppointments(user);
  } else {
    window.location.href = "worker-login.html";
  }
});

function loadWorkerAppointments(user) {
  // ✅ match exact Firestore name ("Appointments" not "appointments")
  const q = query(
    collection(db, "Appointments"),
    where("workerEmail", "==", user.email),
    orderBy("dateTime", "asc")
  );

  onSnapshot(q, (snapshot) => {
    appointmentsTableBody.innerHTML = "";

    if (snapshot.empty) {
      console.warn("⚠️ No appointments found for", user.email);
      appointmentsTableBody.innerHTML = `
        <tr><td colspan="6" style="text-align:center; padding:15px;">No appointments assigned.</td></tr>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Format Firestore timestamp nicely
      const date = data.dateTime?.seconds
        ? new Date(data.dateTime.seconds * 1000).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A";

      // Choose color for status badge
      const statusClass =
        data.status?.toLowerCase() === "completed"
          ? "status-completed"
          : data.status?.toLowerCase() === "confirmed"
          ? "status-confirmed"
          : "status-pending";

      // Add row
      appointmentsTableBody.innerHTML += `
        <tr>
          <td>${data.clientName || "-"}</td>
          <td>${data.service || "-"}</td>
          <td>${date}</td>
          <td>${data.location || "-"}</td>
          <td><span class="status-badge ${statusClass}">${data.status}</span></td>
          <td>
            <button class="btn btn-ghost next-status-btn" data-id="${docSnap.id}">
              Next Status
            </button>
          </td>
        </tr>
      `;
    });

    // === Handle "Next Status" button clicks ===
    document.querySelectorAll(".next-status-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const docId = e.target.dataset.id;
        const docRef = doc(db, "Appointments", docId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return;

        const currentStatus = docSnap.data().status;
        let newStatus = "Pending";
        if (currentStatus === "Pending") newStatus = "Confirmed";
        else if (currentStatus === "Confirmed") newStatus = "Completed";

        await updateDoc(docRef, { status: newStatus });
        console.log(`🔄 Status updated to ${newStatus} for ${docId}`);
      });
    });
  });
}
