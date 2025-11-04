// client-dashboard.js — robust version with visible error banner + safe index usage

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

// ---------- Init ----------
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();


async function getTechName(id) {
  if (!id) return "—";
  try {
    const s = await getDoc(doc(db, "technicians", id));
    return s.exists() ? (s.data().name || id) : id;
  } catch {
    return id;
  }
}

function noDataRow(tbody, cols = 5) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-muted">No records yet</td></tr>`;
}

// ---------- Load Client ----------
async function loadClient(uid) {
  let u;
  try {
    const uSnap = await getDoc(doc(db, "users", uid));
    if (!uSnap.exists()) {
      showError("Your profile (users/{uid}) was not found. Ask support to create it.");
      return;
    }
    u = uSnap.data();
  } catch (err) {
    console.error("users doc error:", err);
    showError("Cannot read profile. Check Firestore rules for /users/{uid} read.");
    return;
  }

  async function getTechName(id) {
  if (!id) return "—";
  try {
    const s = await getDoc(doc(db, "technicians", id));
    return s.exists() ? (s.data().name || id) : id;  // <- fallback to id
  } catch {
    return id; // <- also falls back if rules block the read
  }
}


  // ---- Role gate (must be client) ----
  const role = (u.role || "").toLowerCase();
  if (role && role !== "client") {
    // If this user isn't a client, send them to worker view
    window.location.href = "worker-dashboard.html";
    return;
  }

  // ---- Header fill ----
  $("userName") && ($("userName").textContent = u.name || "Client");
  $("planName") && ($("planName").textContent = u.plan || "—");
  $("visitsLeft") && ($("visitsLeft").textContent = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0));
  $("visitsTotal") && ($("visitsTotal").textContent = u.periodVisits ?? 0);
  $("dedicatedTech") && ($("dedicatedTech").textContent = u.dedicatedTechnicianId
    ? await getTechName(u.dedicatedTechnicianId)
    : "—");

  // ---- Appointments stream ----
  const up = $("upcomingTbody");
  const hi = $("historyTbody");
  if (up) up.innerHTML = "";
  if (hi) hi.innerHTML = "";

  // Use ASC index to be broadly compatible. If you want DESC, change both to "desc"
  // and ensure you have a composite index: clientUid ASC, startAt DESC (or both DESC).
  const qAppts = query(
    collection(db, "appointments"),
    where("clientUid", "==", uid),
    orderBy("startAt", "asc"),   // ← change to "desc" if you prefer newest first
    limit(50)
  );

  try {
    onSnapshot(
      qAppts,
      async (snap) => {
        if (up) up.innerHTML = "";
        if (hi) hi.innerHTML = "";

        let upCount = 0, histCount = 0;

        for (const d of snap.docs) {
          const a = d.data();
          const tech = await getTechName(a.technicianId);
          const date = fmt(a.startAt);
          const status = (a.status || "").toLowerCase();

          if (status === "completed") {
            histCount++;
            hi?.insertAdjacentHTML("beforeend", `
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
                      : status === "pending"   ? "badge-warning"
                      :                          "badge-secondary";
            const iso = a.startAt?.toDate ? a.startAt.toDate().toISOString() : "";
            up?.insertAdjacentHTML("beforeend", `
              <tr>
                <td>${a.service || "—"}</td>
                <td>${date}</td>
                <td>${tech}</td>
                <td><span class="badge ${cls}">${a.status || "—"}</span></td>
                <td>
                  <button class="btn btn-sm btn-outline-primary act-reschedule"
                          data-id="${d.id}" data-start="${iso}">
                    Reschedule
                  </button>
                </td>
              </tr>
            `);
          }
        }

        if (!upCount) noDataRow(up, 5);
        if (!histCount) noDataRow(hi, 5);
        showInfo(""); // clear banner if there was one
      },
      (err) => {
        console.error("onSnapshot error:", err);
        const msg = String(err?.message || "");
        if (msg.includes("index")) {
          showError("This view needs an index on APPOINTMENTS (clientUid + startAt). Click the link shown in DevTools console, wait until it is Enabled, then refresh.");
        } else if (msg.toLowerCase().includes("permission") || msg.includes("insufficient")) {
          showError("Missing/insufficient permissions to read your appointments. Recheck Firestore rules.");
        } else {
          showError("Could not load appointments. See console for details.");
        }
      }
    );
  } catch (err) {
    console.error("query setup failed:", err);
    showError("Failed to start appointments listener. Check rules or indexes.");
  }

  // ---- Reschedule handler ----
  $("upcomingTbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button.act-reschedule");
    if (!btn) return;

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

    try {
      await updateDoc(doc(db, "appointments", apptId), {
        startAt: Timestamp.fromDate(when),
        updatedAt: Timestamp.now()
      });
      Swal.fire('Updated', 'Your appointment was rescheduled.', 'success');
    } catch (err) {
      console.error("reschedule failed:", err);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("permission")) {
        showError("You don't have permission to reschedule this appointment (rules).");
      } else {
        showError("Reschedule failed. See console for details.");
      }
    }
  });

  // ---- "New Appointment" (schedule) ----
$("newAppointmentBtn")?.addEventListener("click", async () => {
  // Ensure profile loaded above as `u`
  if (!u?.dedicatedTechnicianId) {
    await Swal.fire('Missing technician', 'Your profile has no assigned technician yet. Please contact support.', 'warning');
    return;
  }

  const services = ['Device Setup','System Check','Network Setup','Software Support','Other'];
  const html = `
    <div class="text-start">
      <label>Service</label>
      <select id="svc" class="swal2-select">
        ${services.map(s=>`<option>${s}</option>`).join('')}
      </select>
      <label class="mt-3">Preferred Date</label>
      <input id="date" type="date" class="swal2-input" />
      <label class="mt-3">Time</label>
      <select id="time" class="swal2-select">
        <option>09:00</option><option>11:00</option><option>13:00</option>
        <option>15:00</option><option>17:00</option>
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
      const time = document.getElementById("time").value?.trim() || "09:00";
      if (!date) { Swal.showValidationMessage("Please choose a date"); return false; }
      const start = new Date(`${date}T${time}:00`);
      if (isNaN(start.getTime())) { Swal.showValidationMessage("Invalid date/time"); return false; }
      return {
        service: document.getElementById("svc").value,
        startAt: Timestamp.fromDate(start),
        notes: document.getElementById("notes").value || ""
      };
    }
  });

  if (!res.isConfirmed) return;

  try {
    await addDoc(collection(db, "appointments"), {
      clientUid: uid,                              // <— the signed-in client's uid
      clientName: u.name || "Client",
      technicianId: u.dedicatedTechnicianId,      // <— must be a string, must match worker
      service: res.value.service,
      status: "pending",                           // allowed by rules
      startAt: res.value.startAt,
      location: u.address || "—",
      notes: res.value.notes,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    Swal.fire("Scheduled", "Your request has been submitted.", "success");
  } catch (err) {
    console.error("add appointment failed:", err);
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
      Swal.fire("Not allowed", "Your account isn’t permitted to create appointments. Please contact support.", "error");
    } else {
      Swal.fire("Error", "Could not create the appointment. See console for details.", "error");
    }
  }
});

  // ---- Logout ----
  $("logoutLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth).finally(() => (window.location.href = "client.html"));
  });
}

// ---------- Auth gate ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "client.html"; return; }

  // Early read to verify profile + role; loadClient() handles rest
  try {
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists()) { showError("Your profile was not found. Ask support to create users/{uid}."); return; }
  } catch (err) {
    console.error("initial profile read failed:", err);
    showError("Cannot read profile. Check Firestore rules for /users/{uid} read.");
    return;
  }

  loadClient(user.uid);
});


