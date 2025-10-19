// client-dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

const userNameSpan = document.getElementById('userName');
const appointmentsTableBody = document.querySelector('.appointments-table tbody');
const upcomingCount = document.getElementById('upcomingCount');

// Handle user authentication
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'client.html';
    return;
  }

  userNameSpan.textContent = user.displayName || user.email;

  // Load appointments for this client
  const appointmentsRef = collection(db, "appointments");
  const q = query(appointmentsRef, where("clientId", "==", user.uid), orderBy("date"));
  
  onSnapshot(q, (snapshot) => {
    appointmentsTableBody.innerHTML = "";
    let count = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      count++;
      const dateObj = data.date.toDate();
      const dateStr = dateObj.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
      const statusClass = data.status === "Completed" ? "badge-success" :
                          data.status === "Pending" ? "badge-warning" : "badge-primary";
      appointmentsTableBody.innerHTML += `
        <tr>
          <td>${data.service}</td>
          <td>${dateStr}</td>
          <td>${data.technician || "-"}</td>
          <td><span class="badge ${statusClass}">${data.status}</span></td>
          <td><button class="btn btn-sm btn-outline-primary">Details</button></td>
        </tr>
      `;
    });
    upcomingCount.textContent = count;
  });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  localStorage.clear();
  window.location.href = 'client.html';
});

// New Appointment
document.getElementById('newAppointmentBtn').addEventListener('click', async () => {
  const { value: formValues } = await Swal.fire({
    title: 'New Appointment',
    html: `
      <form id="appointmentForm">
        <div class="mb-3 text-start">
          <label class="form-label">Service Type</label>
          <select class="form-select" id="serviceType">
            <option>Device Setup</option>
            <option>System Check</option>
            <option>Network Setup</option>
            <option>Software Support</option>
            <option>Other</option>
          </select>
        </div>
        <div class="mb-3 text-start">
          <label class="form-label">Preferred Date</label>
          <input type="date" class="form-control" id="appointmentDate">
        </div>
        <div class="mb-3 text-start">
          <label class="form-label">Notes</label>
          <textarea class="form-control" rows="3" id="appointmentNotes"></textarea>
        </div>
      </form>
    `,
    showCancelButton: true,
    confirmButtonText: 'Schedule',
    preConfirm: () => {
      return {
        service: document.getElementById('serviceType').value,
        date: document.getElementById('appointmentDate').value,
        notes: document.getElementById('appointmentNotes').value
      };
    }
  });

  if (formValues) {
    const user = auth.currentUser;
    await addDoc(collection(db, "appointments"), {
      clientId: user.uid,
      clientEmail: user.email,
      service: formValues.service,
      date: Timestamp.fromDate(new Date(formValues.date)),
      notes: formValues.notes,
      status: "Pending",
      createdAt: Timestamp.now()
    });
    Swal.fire('Scheduled!', 'Your appointment has been added.', 'success');
  }
});
