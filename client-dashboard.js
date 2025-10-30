// client-dashboard.js (single source of truth)

// ---------- Imports (Firebase v11) ----------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, limit,
  onSnapshot, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------- Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyADe9mr_6oE5L8lK8enCM2R43IJUz1GVcg",
  authDomain: "click-and-care-client-portal.firebaseapp.com",
  projectId: "click-and-care-client-portal",
  storageBucket: "click-and-care-client-portal.firebasestorage.app",
  messagingSenderId: "469706454671",
  appId: "1:469706454671:web:663408e0c167884126e2fa",
  measurementId: "G-G1NXSLG0VK"
};

// ---------- Init ----------
const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---------- Helpers ----------
const $   = (id) => document.getElementById(id);
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();

async function getTechName(id) {
  if (!id) return "—";
  const s = await getDoc(doc(db, "technicians", id));
  return s.exists() ? (s.data().name || id) : id;
}

function noDataRow(tbody, cols = 5) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-muted">No records yet</td></tr>`;
}

// ---------- Load client + appointments ----------
async function loadClient(uid) {
  // Profile
  const uSnap = await getDoc(doc(db, "users", uid));
  if (!uSnap.exists()) return;
  const u = uSnap.data();

  $("userName").textContent    = u.name || "Client";
  $("planName").textContent    = u.plan || "—";
  $("visitsLeft").textContent  = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0);
  $("visitsTotal").textContent = u.periodVisits ?? 0;
  $("dedicatedTech").textContent = u.dedicatedTechnicianId
    ? await getTechName(u.dedicatedTechnicianId)
    : "—";

  // Appointments for this client
  const apptsRef = collection(db, "appointments");
  const qAppts = query(
    apptsRef,
    where("clientUid", "==", uid),
    orderBy("startAt", "desc"),
    limit(25)
  );

  onSnapshot(qAppts, async (snap) => {
    const up = $("upcomingTbody");
    const hi = $("historyTbody");
    up.innerHTML = ""; hi.innerHTML = "";

    let upCount = 0, histCount = 0;

    for (const d of snap.docs) {
      const a    = d.data();
      const tech = await getTechName(a.technicianId);
      const date = fmt(a.startAt);
      const status = (a.status || "").toLowerCase();

      if (status === "completed") {
        histCount++;
        hi.insertAdjacentHTML("beforeend",
          `<tr><td>${a.service||"—"}</td><td>${date}</td><td>${tech}</td><td><span class="badge badge-success">Completed</span></td><td>${a.notes||""}</td></tr>`
        );
      } else {
        upCount++;
        const cls = status === "scheduled" ? "badge-primary"
                 : status === "pending"   ? "badge-warning"
                 :                          "badge-secondary";
        up.insertAdjacentHTML("beforeend",
          `<tr><td>${a.service||"—"}</td><td>${date}</td><td>${tech}</td><td><span class="badge ${cls}">${a.status||"—"}</span></td><td><button class="btn btn-sm btn-outline-primary" disabled>Reschedule</button></td></tr>`
        );
      }
    }

    if (!upCount)   noDataRow(up, 5);
    if (!histCount) noDataRow(hi, 5);
  });

  // Button handlers (basic)
  $("viewPackagesBtn")?.addEventListener("click", () => {
    Swal.fire({ title:"Your Packages", text:"Ask support to enable packages display from your profile." });
  });
  $("upgradePlanBtn")?.addEventListener("click", () => {
    Swal.fire({ title:"Upgrade Plan", text:"Upgrades will be handled by support.", icon:"info" });
  });
  $("messageTechBtn")?.addEventListener("click", () => {
    Swal.fire({ title:"Message Technician", input:"textarea", inputPlaceholder:"Type your message...", confirmButtonText:"Send" });
  });

  $("newAppointmentBtn")?.addEventListener("click", async () => {
    const services = ['Device Setup','System Check','Network Setup','Software Support','Other'];
    const html = `
      <div class="text-start">
        <label class="form-label">Service</label>
        <select id="svc" class="form-select">
          ${services.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <label class="form-label mt-3">Preferred Date</label>
        <input id="date" type="date" class="form-control" />
        <label class="form-label mt-3">Time</label>
        <select id="time" class="form-select">
          <option>09:00</option><option>11:00</option><option>13:00</option><option>15:00</option><option>17:00</option>
        </select>
        <label class="form-label mt-3">Notes</label>
        <textarea id="notes" class="form-control" rows="3"></textarea>
      </div>
    `;
    const res = await Swal.fire({
      title:"New Appointment",
      html, showCancelButton:true, confirmButtonText:"Schedule", confirmButtonColor:"#d6b35b",
      preConfirm: () => {
        const date = document.getElementById('date').value?.trim();
        const time = document.getElementById('time').value?.trim();
        if (!date) { Swal.showValidationMessage('Please choose a date'); return false; }
        const start = new Date(`${date}T${time}:00`);
        if (isNaN(start.getTime())) { Swal.showValidationMessage('Invalid date/time'); return false; }
        return {
          service: document.getElementById('svc').value,
          startAt: Timestamp.fromDate(start),
          notes: document.getElementById('notes').value || ''
        };
      }
    });
    if (!res.isConfirmed) return;

    const payload = res.value;
    await addDoc(collection(db, "appointments"), {
      clientUid: uid,
      clientName: u.name || "Client",
      technicianId: u.dedicatedTechnicianId || null,
      service: payload.service,
      status: "pending",
      startAt: payload.startAt,
      location: u.address || "—",
      notes: payload.notes,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    Swal.fire("Scheduled", "Your request has been submitted.", "success");
  });

  $("logoutLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth).finally(() => (window.location.href = "client.html"));
  });
}

// ---------- Gate by auth ----------
onAuthStateChanged(auth, (user) => {
  if (user?.uid) loadClient(user.uid);
  else window.location.href = "client.html";
});
