// worker-appointments.js — calendar view + solid modal + status actions + PDF upload

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, onSnapshot,
  updateDoc, runTransaction, serverTimestamp, increment, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// Your existing config
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
const storage = getStorage(app);

// FullCalendar
import "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js";
// SweetAlert2 (make sure you also include it in HTML, but importing here is fine if you already have <script> tag)
if (!window.Swal) { await import("https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"); }

const fmtDate = (v) => (v?.toDate?.() ? v.toDate() : new Date(v));
const fmtStr  = (v) => fmtDate(v).toLocaleString();

function statusColor(s) {
  const k = (s || "").toLowerCase();
  if (k === "completed") return "#22c55e";
  if (k === "scheduled") return "#60a5fa";
  return "#f59e0b"; // pending
}

function buildEvent(a, id) {
  return {
    id,
    title: `${a.service || "Service"} — ${a.clientName || a.clientUid || "Client"}`,
    start: fmtDate(a.startAt),
    backgroundColor: statusColor(a.status),
    borderColor: statusColor(a.status),
    textColor: "#0b0b0d",
    extendedProps: {
      apptId: id,
      status: a.status || "pending",
      clientName: a.clientName || a.clientUid || "Client",
      clientUid: a.clientUid || null,
      service: a.service || "Service",
      location: a.location || "—",
      notes: a.notes || "",
      // expose files list if present
      notesFiles: a.notesFiles || []
    }
  };
}

// ---- Status actions ----
async function setStatus(apptId, newStatus) {
  await updateDoc(doc(db, "appointments", apptId), {
    status: newStatus,
    updatedAt: serverTimestamp()
  });
}

async function completeAppointment(apptId) {
  const apptRef = doc(db, "appointments", apptId);

  // 1) Mark the appointment as completed
  await updateDoc(apptRef, {
    status: "completed",
    updatedAt: serverTimestamp()
  });

  // 2) Best-effort bump the client counters
  try {
    const apptSnap = await getDoc(apptRef);
    if (!apptSnap.exists()) return;
    const appt = apptSnap.data();
    if (!appt.clientUid) return;

    const userRef = doc(db, "users", appt.clientUid);

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const currentVisits = Number(userData.visitsUsed ?? 0) || 0;

    await updateDoc(userRef, {
      visitsUsed: currentVisits + 1,
      lastCompletedAt: serverTimestamp()
    });

  } catch (err) {
    console.warn("Completed appt, but could not bump client counters:", err);
  }
}


// ---- PDF upload ----
async function uploadPdfForAppointment(apptId, file, currentUser) {
  if (!file) return;
  if (file.type !== "application/pdf") {
    throw new Error("Please select a PDF file.");
  }
  // (Optional) 10 MB size cap
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File is too large. Max 10 MB.");
  }

  const key = `appointments/${apptId}/notes/${Date.now()}_${file.name}`;
  const ref = storageRef(storage, key);
  await uploadBytes(ref, file, { contentType: "application/pdf" });
  const url = await getDownloadURL(ref);

  await updateDoc(doc(db, "appointments", apptId), {
    notesFiles: arrayUnion({
      url,
      name: file.name,
      uploadedAt: serverTimestamp(),
      uploadedBy: currentUser?.uid || "worker"
    })
  });

  return { url, name: file.name };
}

// ---- Modal (opaque) ----
function showEventModal(ev, currentUser) {
  const p = ev.event.extendedProps;
  const when = ev.event.start?.toLocaleString() || "—";

  // Current files list
  const filesList = (p.notesFiles || []).map(f => `
    <div style="display:flex;justify-content:space-between;gap:12px;">
      <a href="${f.url}" target="_blank" rel="noopener">${f.name || 'PDF note'}</a>
    </div>`).join("") || `<span class="muted">No files yet</span>`;

  const html = `
    <div style="text-align:left;display:grid;gap:8px;">
      <div style="opacity:.85">${ev.event.title}</div>
      <div><strong>When:</strong> ${when}</div>
      <div><strong>Status:</strong> ${p.status}</div>
      <div><strong>Client:</strong> ${p.clientName}</div>
      <div><strong>Service:</strong> ${p.service}</div>
      <div><strong>Location:</strong> ${p.location}</div>
      ${p.notes ? `<div><strong>Notes:</strong> ${p.notes}</div>` : ""}
      <div style="margin-top:8px;">
        <strong>Files:</strong>
        <div style="margin-top:6px;display:grid;gap:6px">${filesList}</div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" id="btnOpenClient">Open Client</button>
        <button class="btn" id="btnPending">Set Pending</button>
        <button class="btn" id="btnScheduled">Set Scheduled</button>
        <button class="btn btn-primary" id="btnComplete">Mark Completed</button>
        <button class="btn" id="btnUploadPdf">Upload PDF</button>
        <input type="file" id="pdfInput" accept="application/pdf" style="display:none" />
      </div>
    </div>
  `;

  Swal.fire({
    title: "Appointment",
    html,
    showConfirmButton: false,
    showCloseButton: true,
    width: 640
  });

  // Wire buttons
  const apptId = p.apptId;

  document.getElementById("btnOpenClient")?.addEventListener("click", () => {
    if (p.clientUid) window.location.href = `worker-client-detail.html?uid=${encodeURIComponent(p.clientUid)}`;
  });

  document.getElementById("btnPending")?.addEventListener("click", async () => {
    try {
      await setStatus(apptId, "pending");
      Swal.close();
    } catch (e) {
      console.error(e); Swal.fire("Error", e.message || "Failed to update status", "error");
    }
  });

  document.getElementById("btnScheduled")?.addEventListener("click", async () => {
    try {
      await setStatus(apptId, "scheduled");
      Swal.close();
    } catch (e) {
      console.error(e); Swal.fire("Error", e.message || "Failed to update status", "error");
    }
  });

  document.getElementById("btnComplete")?.addEventListener("click", async () => {
    try {
      await completeAppointment(apptId);
      Swal.close();
    } catch (e) {
      console.error(e); Swal.fire("Error", e.message || "Failed to complete visit", "error");
    }
  });

  // Upload
  const input = document.getElementById("pdfInput");
  document.getElementById("btnUploadPdf")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async (evChange) => {
    const file = evChange.target.files?.[0];
    if (!file) return;
    try {
      Swal.showLoading();
      await uploadPdfForAppointment(apptId, file, currentUser);
      Swal.close();
      Swal.fire("Uploaded", "PDF note attached to appointment.", "success");
    } catch (e) {
      console.error(e);
      Swal.fire("Upload failed", e.message || "Could not upload file.", "error");
    }
  });
}

// ---- Calendar boot ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "worker-login.html"; return; }

  // Determine this tech’s id
  const meSnap = await getDoc(doc(db, "users", user.uid));
  if (!meSnap.exists()) return;
  const me = meSnap.data();
  const techId = me.technicianId || me.dedicatedTechnicianId;
  if (!techId) return;

  const calendarEl = document.getElementById("calendar");
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "today prev,next",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek"
    },
    height: "auto",
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      showEventModal(info, user);
    },
    eventDidMount: (arg) => {
      arg.el.style.filter = "saturate(1) contrast(1.1)";
    }
  });
  calendar.render();

  // live feed of this tech’s appointments
  const qAppts = query(
    collection(db, "appointments"),
    where("technicianId", "==", techId),
    orderBy("startAt", "asc")
  );

  onSnapshot(qAppts, (snap) => {
    calendar.getEvents().forEach(e => e.remove());
    snap.forEach(docSnap => {
      calendar.addEvent(buildEvent(docSnap.data(), docSnap.id));
    });
  });
});
