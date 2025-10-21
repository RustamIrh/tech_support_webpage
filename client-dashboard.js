import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, onSnapshot, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js";

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('userName').textContent = user.displayName || user.email;
    loadAppointments();
  } else {
    window.location.href = "client.html";
  }
});

async function loadAppointments() {
  const q = query(
    collection(db, 'appointments'),
    where('clientEmail', '==', currentUser.email),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    const tbody = document.querySelector('.appointments-table tbody');
    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const statusClass = data.status === 'Completed' ? 'badge-success' :
                          data.status === 'Pending' ? 'badge-warning' : 'badge-primary';
      tbody.innerHTML += `
        <tr>
          <td>${data.serviceType}</td>
          <td>${data.preferredDate}</td>
          <td>${data.assignedWorker || '-'}</td>
          <td><span class="badge ${statusClass}">${data.status}</span></td>
          <td><button class="btn btn-sm btn-outline-primary">Details</button></td>
        </tr>
      `;
    });
  });
}

// Schedule new appointment
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
          <input type="date" class="form-control" id="preferredDate">
        </div>
        <div class="mb-3 text-start">
          <label class="form-label">Notes</label>
          <textarea class="form-control" rows="3" id="notes"></textarea>
        </div>
      </form>
    `,
    showCancelButton: true,
    confirmButtonText: 'Schedule',
    preConfirm: () => ({
      serviceType: document.getElementById('serviceType').value,
      preferredDate: document.getElementById('preferredDate').value,
      notes: document.getElementById('notes').value
    })
  });

  if (formValues) {
    await addDoc(collection(db, 'appointments'), {
      clientName: currentUser.displayName || currentUser.email,
      clientEmail: currentUser.email,
      serviceType: formValues.serviceType,
      preferredDate: formValues.preferredDate,
      notes: formValues.notes,
      status: 'Pending',
      assignedWorker: null,
      createdAt: serverTimestamp()
    });
    Swal.fire('Scheduled!', 'Your appointment has been added.', 'success');
  }
});
