// worker-client-detail.js — show one client's profile & appointments

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

const fmt = (v) => (v?.toDate?.() ? v.toDate() : new Date(v)).toLocaleString();

const params = new URLSearchParams(location.search);
const uid = params.get("uid");

const elName = document.getElementById("clientName");
const elProfile = document.getElementById("profileInfo");
const elPlan = document.getElementById("planInfo");
const elTbody = document.getElementById("apptTbody");

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "worker-login.html"; return; }
  if (!uid) {
    elName.textContent = "Client (missing uid)";
    elProfile.textContent = "No UID in URL.";
    return;
  }

  // Profile
  const uSnap = await getDoc(doc(db, "users", uid));
  if (!uSnap.exists()) {
    elName.textContent = "Client not found";
    elProfile.textContent = "users/" + uid + " does not exist.";
    return;
  }
  const u = uSnap.data();
  const visitsLeft = (u.periodVisits ?? 0) - (u.visitsUsed ?? 0);

  elName.textContent = u.name || "Client";
  elProfile.innerHTML = `
    <div><strong>Email:</strong> ${u.email || "—"}</div>
    <div><strong>Phone:</strong> ${u.phone || "—"}</div>
    <div><strong>Address:</strong> ${u.address || "—"}</div>
    <div><strong>Assigned Tech:</strong> ${u.dedicatedTechnicianId || "—"}</div>
  `;
  elPlan.innerHTML = `
    <div><strong>Plan:</strong> ${u.plan || "—"}</div>
    <div><strong>Visits Left:</strong> ${visitsLeft} of ${u.periodVisits ?? 0}</div>
    <div><strong>Billing:</strong> ${u.billingStatus || "Active"}</div>
  `;

  // Appointments
  try {
    const qAppts = query(
      collection(db, "appointments"),
      where("clientUid", "==", uid),
      orderBy("startAt", "desc")
    );
    const snap = await getDocs(qAppts);
    elTbody.innerHTML = "";
    if (snap.empty) {
      elTbody.innerHTML = `<tr><td colspan="5" class="muted">No appointments yet.</td></tr>`;
    } else {
      snap.forEach((ds) => {
        const a = ds.data();
        elTbody.insertAdjacentHTML("beforeend", `
          <tr>
            <td>${a.service || "—"}</td>
            <td>${a.startAt ? fmt(a.startAt) : "—"}</td>
            <td>${a.status || "—"}</td>
            <td>${a.technicianId || "—"}</td>
            <td>${a.notes || ""}</td>
          </tr>
        `);
      });
    }
  } catch (e) {
    console.error("Appointments query failed:", e);
    elTbody.innerHTML = `<tr><td colspan="5" style="color:#f88">Cannot read appointments. Create the suggested index, then refresh.</td></tr>`;
  }
});
