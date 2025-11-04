// worker-dashboard.js — worker actions: schedule/pending/complete + KPIs + role gate

// ---- Firebase (v11) ----
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, onSnapshot,
  updateDoc, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- Config ----
const firebaseConfig = {
  apiKey: "AIzaSyADe9mr_6oE5L8lK8enCM2R43IJUz1GVcg",
  authDomain: "click-and-care-client-portal.firebaseapp.com",
  projectId: "click-and-care-client-portal",
  storageBucket: "click-and-care-client-portal.firebasestorage.app",
  messagingSenderId: "469706454671",
  appId: "1:469706454671:web:663408e0c167884126e2fa",
  measurementId: "G-G1NXSLG0VK"
};

// ---- Init ----
const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---- Helpers / Elements ----
const $ = (id) => document.getElementById(id);
const elTodayAppointments = $("todayAppointments");
const elActiveClients     = $("activeClients");
const elResolvedRate      = $("resolvedRate");
const elAppointmentsBody  = document.querySelector("#appointmentsTable tbody");
const elWorkerName        = $("workerName");
const elWorkerRole        = $("workerRole");
const elWorkerAvatar      = $("workerAvatar");
const elCurrentDate       = $("currentDate");

const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();
if (window.feather) window.feather.replace();
if (elCurrentDate)  elCurrentDate.textContent = " " + new Date().toLocaleDateString();

// ---- Actions ----
async function setStatus(apptId, newStatus) {
  const ref = doc(db, "appointments", apptId);
  await updateDoc(ref, { status: newStatus, updatedAt: serverTimestamp() });
}

async function completeAppointment(apptId) {
  await runTransaction(db, async (tx) => {
    const apptRef = doc(db, "appointments", apptId);

    // 1) READ everything first
    const apptSnap = await tx.get(apptRef);
    if (!apptSnap.exists()) return;
    const appt = apptSnap.data();

    if ((appt.status || "").toLowerCase() === "completed") return;

    let userRef = null;
    let userSnap = null;
    if (appt.clientUid) {
      userRef = doc(db, "users", appt.clientUid);
      userSnap = await tx.get(userRef);
    }

    // 2) WRITE after all reads
    tx.update(apptRef, { status: "completed", updatedAt: serverTimestamp() });

    if (userRef && userSnap?.exists()) {
      tx.update(userRef, {
        visitsUsed: increment(1),
        lastCompletedAt: serverTimestamp()
      });
    }
  });
}

// ---- Main ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "worker-login.html"; return; }

  // 1️⃣ Load profile
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) { 
    console.warn("No users/{uid} profile for this worker."); 
    window.location.href = "worker-login.html";
    return; 
  }
  const worker = profileSnap.data();

  // 2️⃣ Role Gate — only technicians may view this page
  const role = (worker.role || "").toLowerCase();
  if (role !== "technician") {
    window.location.href = "dashboard.html"; // redirect clients away
    return;
  }

  // 3️⃣ Header Info
  const name = worker.name || user.displayName || user.email || "Worker";
  if (elWorkerName) elWorkerName.textContent = name;
  if (elWorkerRole) elWorkerRole.textContent = worker.role || "Technician";
  if (elWorkerAvatar) {
    const initials = name.split(" ").map(s => s[0]).join("").substring(0,2).toUpperCase();
    elWorkerAvatar.textContent = initials || "W";
  }

  // 4️⃣ Technician ID
  const techId = worker.technicianId || worker.dedicatedTechnicianId;
  if (!techId) { console.warn("users/{uid} has no technicianId/dedicatedTechnicianId."); return; }

  // Query appointments for this technician
  const qUpcoming = query(
    collection(db, "appointments"),
    where("technicianId", "==", techId),
    orderBy("startAt", "asc")
  );

  onSnapshot(qUpcoming, (snap) => {
    if (elAppointmentsBody) elAppointmentsBody.innerHTML = "";

    let todayCount = 0;
    const activeClientsSet = new Set();
    let completedLast30 = 0;
    let totalLast30 = 0;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const daysAgo30    = new Date(now.getTime() - 30*24*60*60*1000);

    // render only pending/scheduled
    snap.forEach((docSnap) => {
      const a = docSnap.data();
      const id = docSnap.id;
      const dt = a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt);
      const status = (a.status || "").toLowerCase();

      // KPIs (includes completed)
      if (dt >= startOfToday && dt < endOfToday) todayCount++;
      if (a.clientUid) activeClientsSet.add(a.clientUid);
      if (dt >= daysAgo30 && dt <= now) {
        totalLast30++;
        if (status === "completed") completedLast30++;
      }

      // 🧠 Skip rendering completed appointments
      if (status === "completed") return;

      const statusClass =
        status === "scheduled" ? "status-confirmed" :
        status === "pending"   ? "status-pending"   :
                                 "status-completed";

      let actionsHTML = "";
      if (status === "pending") {
        actionsHTML += `<button class="btn btn-primary" data-action="schedule" data-id="${id}">Set Scheduled</button> `;
      } else if (status === "scheduled") {
        actionsHTML += `<button class="btn btn-ghost" data-action="pending" data-id="${id}">Set Pending</button> `;
      }
      actionsHTML += `<button class="btn btn-ghost" data-action="complete" data-id="${id}">Mark Completed</button>`;

      elAppointmentsBody?.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${a.clientName || a.clientUid || "—"}</td>
          <td>${a.service || "—"}</td>
          <td>${fmt(dt)}</td>
          <td>${a.location || "—"}</td>
          <td><span class="status-badge ${statusClass}">${a.status || "—"}</span></td>
          <td>${actionsHTML}</td>
        </tr>
      `);
    });

    // KPIs
    if (elTodayAppointments) elTodayAppointments.textContent = String(todayCount);
    if (elActiveClients)     elActiveClients.textContent     = String(activeClientsSet.size);
    if (elResolvedRate) {
      const pct = totalLast30 ? Math.round((completedLast30 / totalLast30) * 100) : 0;
      elResolvedRate.textContent = `${pct}%`;
    }
  });

  // 6️⃣ Action handlers (buttons)
  elAppointmentsBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    try {
      if (action === "schedule")      await setStatus(id, "scheduled");
      else if (action === "pending")  await setStatus(id, "pending");
      else if (action === "complete") await completeAppointment(id);
    } catch (err) {
      console.error("Action failed:", err);
      alert("Sorry, that action failed. See console for details.");
    }
  });

  // 7️⃣ Logout
  $("logoutLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth).finally(() => (window.location.href = "worker-login.html"));
  });
});




