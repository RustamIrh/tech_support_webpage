// worker-dashboard.js
// DO NOT CHANGE WITHOUT RUSTAM
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// PASTE THE REAL CONFIG (same as dashboard/client pages)
const firebaseConfig = {
  apiKey: "AIzaSyADe9mr_6oE5L8lK8enCM2R43IJUz1GVcg",
  authDomain: "click-and-care-client-portal.firebaseapp.com",
  projectId: "click-and-care-client-portal",
  storageBucket: "click-and-care-client-portal.firebasestorage.app",
  messagingSenderId: "469706454671",
  appId: "1:469706454671:web:663408e0c167884126e2fa",
  measurementId: "G-G1NXSLG0VK"
};

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = (id) => document.getElementById(id);
const elAppointmentsBody = document.querySelector("#appointmentsTable tbody");
const elTodayAppointments = $("todayAppointments");
const elActiveClients = $("activeClients");
const elResolvedRate = $("resolvedRate");
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "worker-login.html"; return; }

  // Load worker profile to get their technicianId
  const prof = await getDoc(doc(db, "users", user.uid));
  if (!prof.exists()) return;
  const w = prof.data();
  const techId = w.technicianId || w.dedicatedTechnicianId;
  if (!techId) return;

  const qUpcoming = query(
    collection(db, "appointments"),
    where("technicianId", "==", techId),
    orderBy("startAt", "asc")
  );

  onSnapshot(qUpcoming, (snap) => {
    if (elAppointmentsBody) elAppointmentsBody.innerHTML = "";

    let todayCount = 0, totalLast30 = 0, completedLast30 = 0;
    const activeClients = new Set();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const daysAgo30    = new Date(now.getTime() - 30*24*60*60*1000);

    snap.forEach((docSnap) => {
      const a = docSnap.data();
      const dt = a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt);
      const status = (a.status || "").toLowerCase();

      if (dt >= startOfToday && dt < endOfToday) todayCount++;
      if (a.clientUid) activeClients.add(a.clientUid);

      if (dt >= daysAgo30 && dt <= now) {
        totalLast30++;
        if (status === "completed") completedLast30++;
      }

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

    if (elTodayAppointments) elTodayAppointments.textContent = String(todayCount);
    if (elActiveClients)     elActiveClients.textContent     = String(activeClients.size);
    if (elResolvedRate) {
      const pct = totalLast30 ? Math.round((completedLast30 / totalLast30) * 100) : 0;
      elResolvedRate.textContent = `${pct}%`;
    }
  });
});

