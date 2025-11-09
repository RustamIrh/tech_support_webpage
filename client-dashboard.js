// client-dashboard.js — Final Gold Accent Edition (Dark Mode + Firestore Fixed)
// -----------------------------------------------------------------------------
// Everything works out-of-the-box with your Firestore rules and dark dashboard UI.

// ---------- Firebase ----------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  Timestamp,
  serverTimestamp
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
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();

// ---------- Toasts ----------
function toast(msg, variant = "success") {
  const cont = $("toastContainer");
  if (!cont) return alert(msg);
  const el = document.createElement("div");
  el.className = `toast align-items-center border-0 show mb-2 text-bg-${
    variant === "danger" ? "danger" : "dark"
  }`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body text-warning">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  cont.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 2600 });
  t.show();
  setTimeout(() => el.remove(), 3200);
}

// ---------- Technician helpers ----------
async function getTechDoc(id) {
  if (!id) return null;
  try {
    const s = await getDoc(doc(db, "technicians", id));
    return s.exists() ? { id, ...s.data() } : null;
  } catch {
    return null;
  }
}
async function getTechName(id) {
  const t = await getTechDoc(id);
  return t?.name || id || "—";
}

// ---------- Calendar helpers ----------
function statusColor(s) {
  const k = (s || "").toLowerCase();
  if (k === "completed") return "#22c55e";
  if (k === "scheduled") return "#60a5fa";
  return "#d6b35b"; // gold for pending
}
function buildEvent(a, id) {
  return {
    id,
    title: `${a.service || "Service"} (${a.status})`,
    start: a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt),
    backgroundColor: "rgba(214,179,91,0.15)", // gold tint
    borderColor: statusColor(a.status),
    textColor: "#ffffff", // pure white readable text
    extendedProps: a
  };
}

// ---------- Main ----------
async function loadClient(uid) {
  let u;
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (!s.exists()) return toast("Profile not found", "danger");
    u = { uid, ...s.data() };
  } catch (err) {
    console.error(err);
    return toast("Error loading profile", "danger");
  }

  // Header stats
  $("userName").textContent = u.name || "Client";
  $("planName").textContent = u.plan || "—";
  $("visitsLeft").textContent = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0);
  $("visitsTotal").textContent = u.periodVisits ?? 0;
  $("dedicatedTech").textContent = u.dedicatedTechnicianId
    ? await getTechName(u.dedicatedTechnicianId)
    : "—";

  // ---------- Real-time Appointments ----------
  const upTbody = $("upcomingTbody");
  const hiTbody = $("historyTbody");

  const qAppts = query(
    collection(db, "appointments"),
    where("clientUid", "==", uid),
    orderBy("startAt", "asc")
  );

  onSnapshot(qAppts, async (snap) => {
    upTbody.innerHTML = "";
    hiTbody.innerHTML = "";

    for (const d of snap.docs) {
      const a = d.data();
      const tech = await getTechName(a.technicianId);
      const date = fmt(a.startAt);
      const status = (a.status || "").toLowerCase();

      if (status === "completed") {
        hiTbody.insertAdjacentHTML(
          "beforeend",
          `<tr class="text-white">
            <td>${a.service}</td>
            <td>${date}</td>
            <td>${tech}</td>
            <td><span class="badge bg-success">Completed</span></td>
            <td>${a.notes || ""}</td>
          </tr>`
        );
      } else {
        const badge =
          status === "scheduled"
            ? "bg-primary"
            : status === "pending"
            ? "bg-warning text-dark"
            : "bg-secondary";
        upTbody.insertAdjacentHTML(
          "beforeend",
          `<tr class="text-white">
            <td>${a.service}</td>
            <td>${date}</td>
            <td>${tech}</td>
            <td><span class="badge ${badge}">${a.status}</span></td>
            <td><button class="btn btn-sm btn-outline-light act-reschedule" data-id="${d.id}">Reschedule</button></td>
          </tr>`
        );
      }
    }

    if (!snap.size)
      upTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No appointments yet</td></tr>`;
  });

  // ---------- Reschedule ----------
  $("upcomingTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest(".act-reschedule");
    if (!btn) return;
    const apptId = btn.dataset.id;
    const { value: when, isConfirmed } = await Swal.fire({
      title: "Reschedule Appointment",
      html: `<input type="datetime-local" id="dt" class="swal2-input" required>`,
      showCancelButton: true,
      confirmButtonText: "Save",
      confirmButtonColor: "#d6b35b",
      background: "#121217",
      color: "#fff",
      preConfirm: () => {
        const v = document.getElementById("dt").value;
        if (!v) {
          Swal.showValidationMessage("Select a date and time");
          return false;
        }
        return new Date(v);
      }
    });
    if (!isConfirmed || !when) return;
    try {
      await updateDoc(doc(db, "appointments", apptId), {
        startAt: Timestamp.fromDate(when),
        updatedAt: serverTimestamp()
      });
      toast("Appointment rescheduled ✅", "success");
    } catch (err) {
      console.error(err);
      toast("Reschedule failed", "danger");
    }
  });

  // ---------- Calendar ----------
  const calendarSection = $("calendarSection");
  const appointmentsNav = $("appointmentsNav");
  let calendar;

  function initCalendar() {
    const el = $("calendar");
    calendar = new FullCalendar.Calendar(el, {
      initialView: "dayGridMonth",
      height: "auto",
      themeSystem: "bootstrap5",
      headerToolbar: {
        left: "today prev,next",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek"
      },
      eventClick: (info) => {
        const p = info.event.extendedProps;
        Swal.fire({
          title: `<span style="color:#f5d679;">${info.event.title}</span>`,
          html: `
            <div style="text-align:left;color:#fff;">
              <div><b>Date:</b> ${info.event.start.toLocaleString()}</div>
              <div><b>Status:</b> ${p.status}</div>
              <div><b>Service:</b> ${p.service}</div>
              <div><b>Technician:</b> ${p.technicianId}</div>
              ${p.notes ? `<div><b>Notes:</b> ${p.notes}</div>` : ""}
            </div>`,
          background: "#0b0b0d",
          color: "#fff",
          confirmButtonText: "Close",
          confirmButtonColor: "#d6b35b"
        });
      },
      eventDidMount: (arg) => {
        arg.el.style.filter = "brightness(1.15)";
        arg.el.style.fontWeight = "600";
      }
    });
    calendar.render();
  }

  function hookCalendarFeed() {
    const qClient = query(
      collection(db, "appointments"),
      where("clientUid", "==", uid),
      orderBy("startAt", "asc")
    );
    onSnapshot(qClient, (snap) => {
      if (!calendar) return;
      calendar.getEvents().forEach((e) => e.remove());
      snap.forEach((ds) => calendar.addEvent(buildEvent(ds.data(), ds.id)));
    });
  }

  appointmentsNav.addEventListener("click", (e) => {
    e.preventDefault();
    calendarSection.classList.remove("d-none");
    calendarSection.scrollIntoView({ behavior: "smooth" });
    if (!calendar) {
      initCalendar();
      hookCalendarFeed();
    }
  });

  // ---------- Account Modal ----------
  $("accountNav").addEventListener("click", async () => {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.data();
    const tech = await getTechDoc(u.dedicatedTechnicianId);
    const acc = $("accountDetails");
    acc.innerHTML = `
      <div class="col-md-6 text-white">
        <p><b>Name:</b> ${d.name}</p>
        <p><b>Email:</b> ${d.email}</p>
        <p><b>Plan:</b> ${d.plan}</p>
      </div>
      <div class="col-md-6 text-white">
        <p><b>Technician:</b> ${tech?.name || "—"}</p>
        <p><b>Contact:</b> ${tech?.email || ""}</p>
      </div>`;
    new bootstrap.Modal($("accountModal")).show();
  });

  // ---------- Settings Modal ----------
  $("settingsNav").addEventListener("click", async () => {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.data();
    $("setName").value = d.name || "";
    $("setEmail").value = d.email || "";
    $("setPlan").value = d.plan || "Assurance";
    $("setPassword").value = "";
    new bootstrap.Modal($("settingsModal")).show();
  });

  $("saveSettingsBtn").addEventListener("click", async () => {
    const name = $("setName").value.trim();
    const email = $("setEmail").value.trim();
    const plan = $("setPlan").value;
    const pwd = $("setPassword").value.trim();
    const btn = $("saveSettingsBtn");
    const spin = $("saveSettingsSpinner");
    if (!name || !email) return toast("Fill all required fields", "warning");

    try {
      btn.disabled = true;
      spin.classList.remove("d-none");
      await updateDoc(doc(db, "users", uid), { name, email, plan, updatedAt: serverTimestamp() });
      if (pwd) await updatePassword(auth.currentUser, pwd);
      bootstrap.Modal.getInstance($("settingsModal")).hide();
      toast("Account updated successfully", "success");
    } catch (err) {
      console.error(err);
      toast("Update failed", "danger");
    } finally {
      btn.disabled = false;
      spin.classList.add("d-none");
    }
  });

  // ---------- Appointment Modal (Create) ----------
  const apptModal = new bootstrap.Modal($("appointmentModal"));
  $("newAppointmentBtn").addEventListener("click", () => apptModal.show());

  $("saveAppointmentBtn").addEventListener("click", async () => {
    const date = $("apptDate").value;
    const time = $("apptTime").value;
    const service = $("apptService").value;
    const notes = $("apptNotes").value.trim();
    const spin = $("saveApptSpinner");
    if (!date || !time) return toast("Select date & time", "warning");

    try {
      spin.classList.remove("d-none");
      const when = new Date(`${date}T${time}:00`);
      await addDoc(collection(db, "appointments"), {
        clientUid: uid,
        clientName: u.name || "Client",
        technicianId: u.dedicatedTechnicianId,
        service,
        status: "pending",
        startAt: Timestamp.fromDate(when),
        notes,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now() // ✅ required by rules
      });
      apptModal.hide();
      toast("Appointment created successfully ✅", "success");
    } catch (err) {
      console.error(err);
      toast("Failed to create appointment", "danger");
    } finally {
      spin.classList.add("d-none");
    }
  });

  // ---------- Support ----------
  $("supportNav").addEventListener("click", (e) => {
    e.preventDefault();
    new bootstrap.Modal($("supportModal")).show();
  });

  // ---------- Logout ----------
  $("logoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth).finally(() => (window.location.href = "client.html"));
  });
}

// ---------- Auth Gate ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "client.html");
  loadClient(user.uid);
});
