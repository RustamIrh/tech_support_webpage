// worker-clients.js — list all clients assigned to this technician

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- Firebase (use your same config) ----
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

// ---- Helpers ----
const $ = (sel) => document.querySelector(sel);
const tbody = $("#clientsTbody");              // <tbody id="clientsTbody"> in worker-clients.html
const searchInput = $("#searchInput");         // <input id="searchInput">
const exportBtn = $("#exportCsvBtn");          // <button id="exportCsvBtn">
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();

// Local cache for search/export
let rowsCache = [];

// ---- Render helpers ----
function setLoading(text = "Loading…") {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="padding:18px;color:var(--muted)">${text}</td></tr>`;
}
function setError(text) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="padding:18px;color:#f88">${text}</td></tr>`;
}
function renderRows(rows) {
  if (!tbody) return;
  if (!rows.length) {
    setLoading("No clients found for your technician id.");
    return;
  }
  tbody.innerHTML = "";
  for (const r of rows) {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${r.name || "—"}</td>
        <td>${r.email || "—"}</td>
        <td>${r.plan || "—"}</td>
        <td>${r.visitsLeft ?? "—"}</td>
        <td>${r.lastAppt || "—"}</td>
        <td>${r.assignedTech || "—"}</td>
        <td>
          <a class="btn btn-ghost" href="worker-client-detail.html?uid=${encodeURIComponent(r.uid)}">View</a>
        </td>
      </tr>
    `);
  }
}

// ---- Search & Export ----
function applySearch() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  if (!q) return renderRows(rowsCache);
  const filtered = rowsCache.filter(r =>
    (r.name || "").toLowerCase().includes(q) ||
    (r.email || "").toLowerCase().includes(q)
  );
  renderRows(filtered);
}

function exportCSV() {
  if (!rowsCache.length) return;
  const header = ["Client","Email","Plan","VisitsLeft","LastAppt","AssignedTech"];
  const lines = [header.join(",")];
  for (const r of rowsCache) {
    const line = [
      r.name || "",
      r.email || "",
      r.plan || "",
      (r.visitsLeft ?? ""),
      r.lastAppt || "",
      r.assignedTech || ""
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",");
    lines.push(line);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clients.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Main flow ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "worker-login.html"; return; }

  try {
    setLoading();

    // Get worker profile -> technicianId
    const meSnap = await getDoc(doc(db, "users", user.uid));
    if (!meSnap.exists()) { setError("Your user profile was not found."); return; }
    const me = meSnap.data();
    const techId = me.technicianId || me.dedicatedTechnicianId;
    if (!techId) { setError("Your profile has no technicianId / dedicatedTechnicianId."); return; }

    // IMPORTANT: users query should NOT orderBy startAt (that field is not on users)
    // We order by name (or email) here.
    const usersQ = query(
      collection(db, "users"),
      where("dedicatedTechnicianId", "==", techId),
      orderBy("name", "asc"),
      limit(500)
    );

    const usersSnap = await getDocs(usersQ);

    // Build rows; for each client, fetch latest appointment (separate query)
    const rows = [];
    for (const uDoc of usersSnap.docs) {
      const u = uDoc.data();
      const uid = uDoc.id;

      // latest appointment for this client
      let lastApptText = "";
      try {
        const lastQ = query(
          collection(db, "appointments"),
          where("clientUid", "==", uid),
          orderBy("startAt", "desc"),
          limit(1)
        );
        const lastSnap = await getDocs(lastQ);
        if (!lastSnap.empty) {
          const a = lastSnap.docs[0].data();
          lastApptText = fmt(a.startAt);
        }
      } catch (e) {
        // If you hit an index error here, it’s on APPOINTMENTS: clientUid + startAt
        console.warn("Last appt query failed for", uid, e);
      }

      const visitsLeft = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0);
      rows.push({
        uid,
        name: u.name || uid,
        email: u.email || "",
        plan: u.plan || "—",
        visitsLeft,
        lastAppt: lastApptText || "—",
        assignedTech: techId
      });
    }

    rowsCache = rows;
    renderRows(rowsCache);

    // Wire UI
    searchInput?.addEventListener("input", applySearch);
    exportBtn?.addEventListener("click", exportCSV);

  } catch (err) {
    console.error("Users query failed:", err);
    if (String(err?.message || "").includes("index")) {
      setError("This view needs an index on APPOINTMENTS (clientUid + startAt). Click the blue link shown in your dev console, wait until it says “Enabled,” then refresh.");
    } else {
      setError("Cannot read users assigned to this tech. Check security rules (see console).");
    }
  }
});



