// worker-dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyADe9mr_6oE5L8lK8enCM2R43IJUz1GVcg",
  authDomain: "click-and-care-client-portal.firebaseapp.com",
  projectId: "click-and-care-client-portal",
  storageBucket: "click-and-care-client-portal.firebasestorage.app",
  messagingSenderId: "469706454671",
  appId: "1:469706454671:web:663408e0c167884126e2fa",
  measurementId: "G-G1NXSLG0VK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appointmentsTableBody = document.querySelector('.appointments-table tbody');
const todayAppointments = document.getElementById('todayAppointments');
const activeClients = document.getElementById('activeClients');
const resolvedPercent = document.getElementById('resolvedPercent');

// Handle worker auth
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'worker-login.html';
    return;
  }
  // Load appointments
  const appointmentsRef = collection(db, "appointments");
  const q = query(appointmentsRef, orderBy("date"));

  onSnapshot(q, (snapshot) => {
    appointmentsTableBody.innerHTML = "";
    let todayCount = 0;
    const clientsSet = new Set();
    let resolvedCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const dateObj = data.date.toDate();
      const today = new Date();
      if (dateObj.toDateString() === today.toDateString()) todayCount++;
      clientsSet.add(data.clientEmail);
      if (data.status === "Completed") resolvedCount++;

      const statusClass = data.status === "Completed" ? "status-completed" :
                          data.status === "Pending" ? "status-pending" : "status-confirmed";

      appointmentsTableBody.innerHTML += `
        <tr>
          <td>${data.clientEmail}</td>
          <td>${data.service}</td>
          <td>${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
          <td>${data.technician || user.displayName || "-"}</td>
          <td><span class="status-badge ${statusClass}">${data.status}</span></td>
          <td><button class="btn btn-primary">Details</button></td>
        </tr>
      `;
    });

    todayAppointments.textContent = todayCount;
    activeClients.textContent = clientsSet.size;
    resolvedPercent.textContent = snapshot.size ? Math.round(resolvedCount / snapshot.size * 100) + "%" : "0%";
  });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'worker-login.html';
});
