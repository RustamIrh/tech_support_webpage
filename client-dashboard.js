// client-dashboard.js 
// -----------------------------------------------------------------------------

// ---------- Firebase ----------
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updatePassword,
  updateEmail,
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
  serverTimestamp,
  writeBatch,
  limit
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
let currentUserData = null;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();
const escapeHtml = (str = "") =>
  String(str ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const timeAgo = (value) => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return "just now";
  const minutes = Math.floor(diff / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};
const notificationIcon = (type = "") => {
  const key = type.toLowerCase();
  if (key.includes("appointment") || key.includes("schedule")) return "mdi-calendar-clock";
  if (key.includes("billing") || key.includes("plan")) return "mdi-credit-card-outline";
  if (key.includes("security")) return "mdi-shield-check";
  if (key.includes("device")) return "mdi-laptop";
  if (key.includes("support") || key.includes("tech")) return "mdi-headset";
  return "mdi-information-outline";
};
function renderNotificationCard(n) {
  const icon = notificationIcon(n.type || n.category || n.techNeed || n.status || "");
  const chipLabel = n.techNeed || n.category || n.type;
  const chip = chipLabel
    ? `<span class="badge bg-dark text-warning border border-warning-subtle text-uppercase ms-2">${escapeHtml(
        chipLabel
      )}</span>`
    : "";
  const subtitle = n.subtitle ? `<div class="text-muted small">${escapeHtml(n.subtitle)}</div>` : "";
  const statusChip = n.status
    ? `<span class="badge bg-secondary text-uppercase">${escapeHtml(n.status)}</span>`
    : "";
  const detail = n.body || n.message || n.detail;
  const progress = n.progress ? `<div class="notification-meta">Progress: ${escapeHtml(n.progress)}</div>` : "";
  const safeUrl = typeof n.actionUrl === "string" && /^https?:\/\//i.test(n.actionUrl) ? n.actionUrl : null;
  const ctaHtml = safeUrl
    ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-warning mt-1">${escapeHtml(
        n.actionLabel || "View details"
      )}</a>`
    : "";
  const timestamp = n.createdAt ? timeAgo(n.createdAt) : "";
  return `
    <div class="notification-card ${n.read ? "" : "unread"}" data-id="${n.id}">
      <i class="mdi ${icon}"></i>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="d-flex flex-column gap-1">
            <div class="fw-semibold d-flex align-items-center flex-wrap gap-2">
              ${escapeHtml(n.title || "Tech Support Update")}
              ${chip}
            </div>
            ${subtitle}
            ${statusChip}
          </div>
          <div class="notification-meta text-nowrap">${timestamp}</div>
        </div>
        ${detail ? `<p class="small mb-2 text-white-50">${escapeHtml(detail)}</p>` : ""}
        ${progress}
        ${ctaHtml}
      </div>
    </div>`;
}
function initNotificationCenter(uid) {
  const btn = $("notificationsBtn");
  const badge = $("notificationBadge");
  const drawerEl = $("notificationsDrawer");
  const listEl = $("notificationsList");
  const emptyEl = $("notificationsEmpty");
  const markBtn = $("markNotificationsReadBtn");
  if (!btn || !drawerEl || !listEl || !badge) return;
  if (btn.dataset.notificationsInit === "1") return;
  btn.dataset.notificationsInit = "1";
  const offcanvas = new bootstrap.Offcanvas(drawerEl);
  let unreadIds = new Set();
  let marking = false;

  const markUnread = async () => {
    if (!unreadIds.size || marking) return;
    marking = true;
    try {
      const batch = writeBatch(db);
      unreadIds.forEach((id) =>
        batch.update(doc(db, "notifications", id), {
          read: true,
          readAt: serverTimestamp()
        })
      );
      await batch.commit();
      unreadIds.clear();
    } catch (err) {
      console.error(err);
      toast("Failed to update notifications", "danger");
    } finally {
      marking = false;
    }
  };

  const qNotifs = query(
    collection(db, "notifications"),
    where("clientUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  onSnapshot(qNotifs, (snap) => {
    const notifications = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    unreadIds = new Set(notifications.filter((n) => !n.read).map((n) => n.id));
    const unreadCount = unreadIds.size;
    if (unreadCount) {
      badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      badge.classList.remove("d-none");
    } else {
      badge.classList.add("d-none");
    }

    if (!notifications.length) {
      listEl.innerHTML = "";
      emptyEl?.classList.remove("d-none");
      return;
    }

    emptyEl?.classList.add("d-none");
    listEl.innerHTML = notifications.map(renderNotificationCard).join("");
  });

  btn.addEventListener("click", () => offcanvas.toggle());
  drawerEl.addEventListener("shown.bs.offcanvas", () => markUnread());
  markBtn?.addEventListener("click", () => markUnread());
}

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
function eventPalette(s) {
  const k = (s || "").toLowerCase();
  if (k === "completed") {
    return { bg: "rgba(34,197,94,0.32)", border: "#22c55e", text: "#f3fff4" };
  }
  if (k === "scheduled") {
    return { bg: "rgba(96,165,250,0.28)", border: "#60a5fa", text: "#f3f7ff" };
  }
  return { bg: "rgba(214,179,91,0.35)", border: "#f8d26a", text: "#fff8dc" }; // gold for pending
}
function buildEvent(a, id) {
  const palette = eventPalette(a.status);
  return {
    id,
    title: `${a.service || "Service"} (${a.status})`,
    start: a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt),
    backgroundColor: palette.bg,
    borderColor: palette.border,
    textColor: palette.text,
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
    currentUserData = u;
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
  initNotificationCenter(uid);

  // ---------- Real-time Appointments ----------
  const upTbody = $("upcomingTbody");
  const hiTbody = $("historyTbody");
  const techNameCache = new Map();
  const fetchTechName = async (id) => {
    if (!id) return "—";
    if (techNameCache.has(id)) return techNameCache.get(id);
    const name = await getTechName(id);
    techNameCache.set(id, name);
    return name;
  };

  const qAppts = query(
    collection(db, "appointments"),
    where("clientUid", "==", uid),
    orderBy("startAt", "asc")
  );

  let renderVersion = 0;
  onSnapshot(qAppts, async (snap) => {
    const myVersion = ++renderVersion;
    const upcomingRows = [];
    const historyRows = [];

    for (const d of snap.docs) {
      const a = d.data();
      const tech = await fetchTechName(a.technicianId);
      const date = fmt(a.startAt);
      const status = (a.status || "").toLowerCase();

      if (status === "completed") {
        historyRows.push(
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
        upcomingRows.push(
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

    // Drop stale renders triggered before this loop finished (e.g., after a reschedule update)
    if (myVersion !== renderVersion) return;

    upTbody.innerHTML = upcomingRows.length
      ? upcomingRows.join("")
      : `<tr><td colspan="5" class="text-center text-muted">No appointments yet</td></tr>`;
    hiTbody.innerHTML = historyRows.join("");
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
        status: "pending",
        updatedAt: serverTimestamp()
      });
      // No toast on success to keep UI clean
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
  $("toggleSetPwd").addEventListener("click", () => {
    const field = $("setPassword");
    const isHidden = field.type === "password";
    field.type = isHidden ? "text" : "password";
    const icon = document.querySelector("#toggleSetPwd i");
    if (icon) icon.className = isHidden ? "mdi mdi-eye-off" : "mdi mdi-eye";
  });

  const settingsNav = $("settingsNav");
  if (settingsNav) {
    settingsNav.addEventListener("click", async () => {
      const snap = await getDoc(doc(db, "users", uid));
      const d = snap.data();
      $("setName").value = d.name || "";
      $("setEmail").value = d.email || auth.currentUser?.email || "";
      const planSelect = $("setPlan");
      planSelect.value = d.plan || "Assurance";
      // keep unusual plan selectable without breaking the form
      if (planSelect.value !== (d.plan || "Assurance")) {
        const opt = document.createElement("option");
        opt.value = d.plan;
        opt.textContent = d.plan;
        planSelect.appendChild(opt);
        planSelect.value = d.plan;
      }
      $("setPassword").value = "";
      $("setCurrentPassword").value = "";
      new bootstrap.Modal($("settingsModal")).show();
    });
  }

  $("saveSettingsBtn").addEventListener("click", async () => {
    const name = $("setName").value.trim();
    const email = $("setEmail").value.trim();
    const plan = $("setPlan").value;
    const newPwd = $("setPassword").value.trim();
    const curPwd = $("setCurrentPassword").value.trim();
    const btn = $("saveSettingsBtn");
    const spin = $("saveSettingsSpinner");
    if (!name || !email) return toast("Fill all required fields", "warning");
    if (newPwd && newPwd.length < 6) return toast("Password must be at least 6 characters", "warning");
    const user = auth.currentUser;
    const needEmailChange = user?.email && email !== user.email;
    const needsReauth = newPwd || needEmailChange;
    if (needsReauth && !curPwd) return toast("Enter current password to update email or password", "warning");

    try {
      btn.disabled = true;
      spin.classList.remove("d-none");
      if (needsReauth) {
        const cred = EmailAuthProvider.credential(user.email, curPwd);
        await reauthenticateWithCredential(user, cred);
      }
      if (needEmailChange) await updateEmail(user, email);
      if (newPwd) await updatePassword(user, newPwd);

      await updateDoc(doc(db, "users", uid), { name, email, plan, updatedAt: serverTimestamp() });

      currentUserData = { ...(currentUserData || {}), name, email, plan };
      $("userName").textContent = name || "Client";
      $("planName").textContent = plan || "—";
      bootstrap.Modal.getInstance($("settingsModal")).hide();
      toast("Account updated successfully", "success");
    } catch (err) {
      console.error(err);
      toast(err.message || "Update failed", "danger");
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
      const [year, month, day] = date.split("-").map((v) => Number(v));
      const [hour, minute] = time.split(":").map((v) => Number(v));
      const when = new Date(year, (month || 1) - 1, day, hour, minute);
      if (Number.isNaN(when.getTime())) {
        throw new Error("Invalid date/time");
      }
      await addDoc(collection(db, "appointments"), {
        clientUid: uid,
        clientName: u.name || "Client",
        technicianId: u.dedicatedTechnicianId,
        service,
        status: "pending",
        startAt: Timestamp.fromDate(when),
        notes,
        location: u.address || "", 
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now() // required by rules
      });
      apptModal.hide();
      // Leave UI quiet on success per request
    } catch (err) {
      console.error(err);
      toast("Failed to create appointment", "danger");
    } finally {
      spin.classList.add("d-none");
    }
  });

  // ---------- Billing (Stripe Payment Links) ----------
  const STRIPE_LINKS = {
    conciergeMonthly: "https://buy.stripe.com/14A28s1vq6uQg13gO30kE02", // Concierge Care $149/mo
    annualMembership: "https://buy.stripe.com/3cIfZi8XS7yUeWZeFV0kE00", // Annual Membership $159/yr
    monthlyPromo: "https://buy.stripe.com/4gM28sa1Wf1mcOR41h0kE01", // One Visit / Month Promo $129/mo
    annualPromo: "https://buy.stripe.com/cNidRaca4aL61699lB0kE03", // One Annual Check-in Promo $135/yr
    welcomeFlightFee: "https://buy.stripe.com/00w00kfmgdXi3ehdBR0kE06", // Welcome Flat Fee $99
    nonMemberHourly: "https://buy.stripe.com/bJebJ26PKdXidSV55l0kE05" // Non-member Hourly $190/hr
  };

  $("billingNav").addEventListener("click", (e) => {
    e.preventDefault();
    new bootstrap.Modal($("billingModal")).show();
  });

  document.querySelectorAll(".billing-link-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const linkId = btn.dataset.linkId;
      const url = STRIPE_LINKS[linkId];
      if (!url) {
        toast("Add a Stripe payment link for this product in client-dashboard.js", "warning");
        return;
      }
      window.open(url, "_blank");
    });
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
