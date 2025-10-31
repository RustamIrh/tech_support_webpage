// client-dashboard.js — FINAL VERSION (clients can reschedule only)

// ---------- Imports (Firebase v11) ----------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, collection, query, where, orderBy, limit,
  onSnapshot, addDoc, updateDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------- Firebase Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyADe9mr_6oE5L8lK8enCM2R43IJUz1GVcg",
  authDomain: "click-and-care-client-portal.firebaseapp.com",
  projectId: "click-and-care-client-portal",
  storageBucket: "click-and-care-client-portal.firebasestorage.app",
  messagingSenderId: "469706454671",
  appId: "1:469706454671:web:663408e0c167884126e2fa",
  measurementId: "G-G1NXSLG0VK"
};

// ---------- Initialize Firebase ----------
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helper Functions ----------
const $ = (id) => document.getElementById(id);
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

// ---------- Load Client Dashboard ----------
async function loadClient(uid) {
  const uSnap = await getDoc(doc(db, "users", uid));
  if (!uSnap.exists()) return;
  const u = uSnap.data();

  // Fill in header details
  $("userName").textContent = u.name || "Client";
  $("planName").textContent = u.plan || "—";
  $("visitsLeft").textContent = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0);
  $("visitsTotal").textContent = u.periodVisits ?? 0;
  $("dedicatedTech").textContent = u.dedicatedTechnicianId
    ? await getTechName(u.dedicatedTechnicianId)
    : "—";

  // Listen to this client’s appointments
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
    up.innerHTML = "";
    hi.innerHTML = "";

    let upCount = 0, histCount = 0;

    for (const d of snap.docs) {
      const a = d.data();
      const tech = await getTechName(a.technicianId);
      const date = fmt(a.startAt);
      const status = (a.status || "").toLowerCase();

      if (status === "completed") {
        histCount++;
        hi.insertAdjacentHTML("beforeend", `
          <tr>
            <td>${a.service || "—"}</td>
            <td>${date}</td>
            <td>${tech}</td>
            <td><span class="badge badge-success">Completed</span></td>
            <td>${a.notes || ""}</td>
          </tr>
        `);
      } else {
        upCount++;
        const cls = status === "scheduled" ? "badge-primary"
                  : status === "pending" ? "badge-warning"
                  : "badge-secondary";

        // Only RESCHEDULE for clients
        up.insertAdjacentHTML("beforeend", `
          <tr>
            <td>${a.service || "—"}</td>
            <td>${date}</td>
            <td>${tech}</td>
            <td><span class="badge ${cls}">${a.status || "—"}</span></td>
            <td>
              <button class="btn btn-sm btn-outline-primary act-reschedule"
                      data-id="${d.id}"
                      data-start="${a.startAt?.toDate ? a.startAt.toDate().toISOString() : ""}">
                Reschedule
              </button>
            </td>
          </tr>
        `);
      }
    }

    if (!upCount) noDataRow(up, 5);
    if (!histCount) noDataRow(hi, 5);
  });

  // Handle RESCHEDULE button
  $("upcomingTbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn || !btn.classList.contains("act-reschedule")) return;

    const apptId = btn.dataset.id;
    const iso = btn.dataset.start || "";
    const initial = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const def = `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}T${pad(initial.getHours())}:${pad(initial.getMinutes())}`;

    const { value: when, isConfirmed } = await Swal.fire({
      title: 'Reschedule Appointment',
      html: `<input id="dt" type="datetime-local" class="swal2-input" value="${def}">`,
      showCancelButton: true,
      confirmButtonText: 'Save',
      confirmButtonColor: '#d6b35b',
      preConfirm: () => {
        const v = document.getElementById('dt').value;
        if (!v) {
          Swal.showValidationMessage('Pick a date & time');
          return false;
        }
        const d = new Date(v);
        if (isNaN(d.getTime())) {
          Swal.showValidationMessage('Invalid datetime');
          return false;
        }
        return d;
      }
    });

    if (!isConfirmed || !when) return;

    await updateDoc(doc(db, "appointments", apptId), {
      startAt: Timestamp.fromDate(when),
      updatedAt: Timestamp.now() // Status stays same
    });

    Swal.fire('Updated', 'Your appointment was rescheduled.', 'success');
  });

  // Add new appointment
  $("newAppointmentBtn")?.addEventListener("click", async () => {
    const services = ['Device Setup', 'System Check', 'Network Setup', 'Software Support', 'Other'];
    const html = `
      <div class="text-start">
        <label>Service</label>
        <select id="svc" class="swal2-select">
          ${services.map(s => `<option>${s}</option>`).join('')}
        </select>
        <label class="mt-3">Preferred Date</label>
        <input id="date" type="date" class="swal2-input" />
        <label class="mt-3">Time</label>
        <select id="time" class="swal2-select">
          <option>09:00</option>
          <option>11:00</option>
          <option>13:00</option>
          <option>15:00</option>
          <option>17:00</option>
        </select>
        <label class="mt-3">Notes</label>
        <textarea id="notes" class="swal2-textarea" rows="3"></textarea>
      </div>
    `;
    const res = await Swal.fire({
      title: "New Appointment",
      html,
      showCancelButton: true,
      confirmButtonText: "Schedule",
      confirmButtonColor: "#d6b35b",
      preConfirm: () => {
        const date = document.getElementById("date").value?.trim();
        const time = document.getElementById("time").value?.trim();
        if (!date) {
          Swal.showValidationMessage("Please choose a date");
          return false;
        }
        const start = new Date(`${date}T${time || "09:00"}:00`);
        if (isNaN(start.getTime())) {
          Swal.showValidationMessage("Invalid date/time");
          return false;
        }
        return {
          service: document.getElementById("svc").value,
          startAt: Timestamp.fromDate(start),
          notes: document.getElementById("notes").value || ""
        };
      }
    });
    if (!res.isConfirmed) return;

    await addDoc(collection(db, "appointments"), {
      clientUid: uid,
      clientName: u.name || "Client",
      technicianId: u.dedicatedTechnicianId || null,
      service: res.value.service,
      status: "pending",
      startAt: res.value.startAt,
      location: u.address || "—",
      notes: res.value.notes,
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

// ---------- Auth Gate ----------
onAuthStateChanged(auth, (user) => {
  if (user?.uid) loadClient(user.uid);
  else window.location.href = "client.html";
});
