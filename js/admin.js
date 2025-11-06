var title = 'Administración LumoraEvents';

const allowedRoles = ["admin"];

let clients = [];
let events = [];

let clientModal;


document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  loadClients();
  loadEvents();

  const authBtn = document.getElementById("auth-btn");

  authBtn.addEventListener("click", () => {
    const token = getToken();
    if (token) {
      localStorage.removeItem("token");
      window.location.href = `/index.html`;
    }
  });

  clientModal = new bootstrap.Modal(document.getElementById('clientModal'));

});

async function loadEvents() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/events/admin`);
    if (!response.ok) throw new Error('Error al cargar los eventos');

    events = await response.json();
    renderEvents();

  } catch (error) {
    console.error('Error cargando clientes:', error);    
  }
}

function renderEvents() {
  const tableBody = document.getElementById("eventsTable");
  tableBody.innerHTML = "";

  if (!clients.length) {
    document.getElementById("emptyState").classList.remove("d-none");
    document.getElementById("count-events").textContent = 0;
    return;
  }

  document.getElementById("emptyState").classList.add("d-none");
  document.getElementById("count-events").textContent = clients.length;

  events.forEach(event => {
    const tr = document.createElement("tr");
    tr.dataset.id = event.id;

    // 🔹 Status badge
    let statusBadge = '';
    switch (event.status) {
      case 'CLO':
        statusBadge = `<span class="badge bg-danger">CLOSED</span>`;
        break;
      case 'OPE':
        statusBadge = `<span class="badge bg-success">OPENED</span>`;
        break;
      case 'FIN':
        statusBadge = `<span class="badge bg-primary">FINISHED</span>`;
        break;
      default:
        statusBadge = `<span class="badge bg-secondary">${event.status}</span>`;
    }

    // 🔹 License badge
    let licenseBadge = '';
    switch (event.license) {
      case 'small':
        licenseBadge = `<span class="badge bg-warning text-dark">SMALL</span>`;
        break;
      case 'medium':
        licenseBadge = `<span class="badge bg-info text-dark">MEDIUM</span>`;
        break;
      case 'large':
        licenseBadge = `<span class="badge bg-orange text-white" style="background-color: orange;">LARGE</span>`;
        break;
      default:
        licenseBadge = `<span class="badge bg-secondary">${event.license}</span>`;
    }

    const visibleIcon = event.visible == 1
      ? `<span class="text-success fw-bold ">✓</span>`
      : `<span class="text-danger fw-bold">✗</span>`;

    const trialIcon = event.visible == 1
      ? `<span class="text-success fw-bold ">✓</span>`
      : '';

    tr.innerHTML = `
      <td>${event.id}</td>
      <td>${event.code}</td>
      <td>${event.name}</td>
      <td>${event.start_form}</td>
      <td>${event.end_form}</td>
      <td>${statusBadge}</td>
      <td>${event.client_name}</td>
      <td>${visibleIcon}</td>
      <td>${trialIcon}</td>
      <td>${licenseBadge}</td>     
      <td class="text-center">
        <div class="btn-group">
          <button type="button" class="btn btn-outline-dark btn-sm btn-duplicate-event" title="Duplicate">
            <i class="bi bi-files"></i>
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm btn-edit-event" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm btn-delete-event" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;


    tableBody.appendChild(tr);
  });

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));
}

async function loadClients() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/clients`);
    if (!response.ok) throw new Error('Error al cargar los clientes');

    clients = await response.json();
    renderClients();

  } catch (error) {
    console.error('Error cargando clientes:', error);    
  }
}

function renderClients() {
  const tableBody = document.getElementById("clientsTable");
  tableBody.innerHTML = "";

  if (!clients.length) {
    document.getElementById("emptyState").classList.remove("d-none");
    document.getElementById("count-clients").textContent = 0;
    return;
  }

  document.getElementById("emptyState").classList.add("d-none");
  document.getElementById("count-clients").textContent = clients.length;

  clients.forEach(client => {
    const tr = document.createElement("tr");
    tr.dataset.id = client.id;

    // Elegir color de num_events según comparación
    let numEventsColor = "bg-success"; // por defecto < booked_events
    if (client.num_events === client.booked_events) numEventsColor = "bg-primary";
    else if (client.num_events > client.booked_events) numEventsColor = "bg-danger";

    tr.innerHTML = `
      <td>${client.id}</td>
      <td>${client.name}</td>
      <td>${client.contact_person}</td>
      <td>${client.email}</td>
      <td>${client.language}</td>
      <td>
        <span class="badge bg-primary" data-bs-toggle="tooltip" title="Eventos contratados">${client.booked_events}</span> / 
        <span class="badge ${numEventsColor}" data-bs-toggle="tooltip" title="Eventos creados">${client.num_events}</span> / 
        <span class="badge bg-warning" data-bs-toggle="tooltip" title="Trials creadas">${client.num_trials}</span>
      </td>      
      <td class="text-center">
        <div class="btn-group">
          <button type="button" class="btn btn-outline-primary btn-sm btn-edit-client" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm btn-delete-client" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;


    tableBody.appendChild(tr);
  });

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));
}

document.addEventListener("click", async (event) => {
  //const editModal = new bootstrap.Modal(document.getElementById("clientModal"));
  const deleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));

  const editBtn = event.target.closest(".btn-edit-client");
  const deleteBtn = event.target.closest(".btn-delete-client");

  if (editBtn) {
    const tr = editBtn.closest("tr");
    const id = tr.dataset.id;
    const client = clients.find(c => c.id == id);

    const form = document.getElementById("clientForm");
    form.dataset.action = "edit";
    form.dataset.id = id;

    document.getElementById("clientName").value = client.name;
    document.getElementById("clientContact").value = client.contact_person;
    document.getElementById("clientEmail").value = client.email;
    document.getElementById("clientLanguage").value = client.language;
    document.getElementById("clientBookedEvents").value = client.booked_events || 0;
    document.getElementById("clientNumEvents").value = client.num_events;
    document.getElementById("clientNumTrials").value = client.num_trials;

    document.querySelector("#clientModal .modal-title span").textContent = "Edit Client";
    clientModal.show();
  }

  if (deleteBtn) {
    const tr = deleteBtn.closest("tr");
    const id = tr.dataset.id;
    const client = clients.find(c => c.id == id);

    document.getElementById("deleteModalMessage").innerHTML =
      `Are you sure you want to delete <strong>${client.name}</strong>?`;

    document.getElementById("confirmDeleteBtn").onclick = async () => {
      await deleteClient(id);
      await loadClients();
      deleteModal.hide();
    };

    deleteModal.show();
  }
});

document.getElementById("createNewClientBtn").addEventListener("click", () => {
  const form = document.getElementById("clientForm");
  form.dataset.action = "create";
  form.reset();

  document.querySelector("#clientModal .modal-title span").textContent = "Create Client";

  clientModal.show();
});

document.getElementById("saveClientBtn").addEventListener("click", async () => {
  const form = document.getElementById("clientForm");
  const action = form.dataset.action;
  const id = form.dataset.id;

  const data = {
    name: document.getElementById("clientName").value.trim(),
    contact_person: document.getElementById("clientContact").value.trim(),
    email: document.getElementById("clientEmail").value.trim(),
    language: document.getElementById("clientLanguage").value,
    booked_events: parseInt(document.getElementById("clientBookedEvents").value, 10) || 0
  };

  try {
    let res;
    if (action === "create") {
      res = await fetch(`${API_BASE_URL}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } else {
      res = await fetch(`${API_BASE_URL}/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      showMessageModal(errData.error || 'Error saving dancer', 'Error');
      return;
    }

    await loadClients();
    clientModal.hide();

  } catch (err) {
    console.error("Error saving client:", err);
  }
});

async function deleteClient(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/clients/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Error deleting client");
  } catch (err) {
    console.error("Error deleting client:", err);
  }
}