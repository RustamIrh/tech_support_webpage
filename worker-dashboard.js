// worker-dashboard.js — matches your current HTML layout (no tab views)

// ---- Firebase (v11) ----
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- Config (same as elsewhere) ----
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

// Feather icons + date
if (window.feather) window.feather.replace();
if (elCurrentDate) elCurrentDate.textContent = " " + new Date().toLocaleDateString();

// ---- Main ----
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "worker-login.html";
    return;
  }

  // Load worker profile to get technicianId
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) {
    console.warn("No users/{uid} profile for this worker.");
    return;
  }
  const worker = profileSnap.data();

  // Header info
  const name = worker.name || user.displayName || user.email || "Worker";
  if (elWorkerName) elWorkerName.textContent = name;
  if (elWorkerRole) elWorkerRole.textContent = worker.role || "Technician";
  if (elWorkerAvatar) {
    const initials = name.split(" ").map(s => s[0]).join("").substring(0,2).toUpperCase();
    elWorkerAvatar.textContent = initials || "W";
  }

  const techId = worker.technicianId || worker.dedicatedTechnicianId;
  if (!techId) {
    console.warn("users/{uid} has no technicianId/dedicatedTechnicianId.");
    return;
  }

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

    snap.forEach((docSnap) => {
      const a = docSnap.data();
      const dt = a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt);
      const status = (a.status || "").toLowerCase();

      // KPIs
      if (dt >= startOfToday && dt < endOfToday) todayCount += 1;
      if (a.clientUid) activeClientsSet.add(a.clientUid);
      if (dt >= daysAgo30 && dt <= now) {
        totalLast30 += 1;
        if (status === "completed") completedLast30 += 1;
      }

      // Table row (show all upcoming; completed will still list as info)
      const statusClass =
        status === "scheduled" ? "status-confirmed" :
        status === "pending"   ? "status-pending"   :
                                 "status-completed";

      elAppointmentsBody?.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${a.clientName || a.clientUid || "—"}</td>
          <td>${a.service || "—"}</td>
          <td>${fmt(dt)}</td>
          <td>${a.location || "—"}</td>
          <td><span class="status-badge ${statusClass}">${a.status || "—"}</span></td>
          <td><button class="btn btn-ghost" disabled>View</button></td>
        </tr>
      `);
    });

    // Update KPI cards
    if (elTodayAppointments) elTodayAppointments.textContent = String(todayCount);
    if (elActiveClients)     elActiveClients.textContent     = String(activeClientsSet.size);
    if (elResolvedRate) {
      const pct = totalLast30 ? Math.round((completedLast30 / totalLast30) * 100) : 0;
      elResolvedRate.textContent = `${pct}%`;
    }
  });

  // Logout
  $("logoutLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth).finally(() => (window.location.href = "worker-login.html"));
  });
});




