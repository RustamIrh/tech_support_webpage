import { db, auth } from "./firebase-config.js";
import { collection, onSnapshot, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const appointmentsTableBody = document.querySelector('.appointments-table tbody');

function loadWorkerAppointments() {
  const q = collection(db, 'appointments');
  onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    appointmentsTableBody.innerHTML = '';
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const statusClass = data.status === 'Completed' ? 'status-completed' :
                          data.status === 'Pending' ? 'status-pending' : 'status-confirmed';
      appointmentsTableBody.innerHTML += `
        <tr>
          <td>${data.clientName}</td>
          <td>${data.serviceType}</td>
          <td>${data.preferredDate}</td>
          <td>${data.assignedWorker || '-'}</td>
          <td><span class="status-badge ${statusClass}">${data.status}</span></td>
          <td>
            <button class="btn btn-primary assign-btn" data-id="${docSnap.id}">Assign to Me</button>
            <button class="btn btn-ghost status-btn" data-id="${docSnap.id}">Next Status</button>
          </td>
        </tr>
      `;
    });

    // Add event listeners for assign/status buttons
    document.querySelectorAll('.assign-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const docId = e.target.dataset.id;
        const workerName = auth.currentUser.displayName || auth.currentUser.email;
        await updateDoc(doc(db, 'appointments', docId), { assignedWorker: workerName });
      });
    });

    document.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const docId = e.target.dataset.id;
        const docRef = doc(db, 'appointments', docId);
        const docSnap = await docRef.get();
        let newStatus = 'Pending';
        if (docSnap.data().status === 'Pending') newStatus = 'Confirmed';
        else if (docSnap.data().status === 'Confirmed') newStatus = 'Completed';
        await updateDoc(docRef, { status: newStatus });
      });
    });
  });
}

loadWorkerAppointments();
