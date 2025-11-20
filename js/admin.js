var title = 'Administración LumoraEvents';

const allowedRoles = ["admin"];

let clients = [];
let events = [];

let clientModal;
let eventModal;

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  await loadClients();
  await loadEvents();

  const authBtn = document.getElementById("auth-btn");

  authBtn.addEventListener("click", () => {
    const token = getToken();
    if (token) {
      localStorage.removeItem("token");
      window.location.href = `/index.html`;
    }
  });

  clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
  eventModal = new bootstrap.Modal(document.getElementById('eventModal'));

  // botón crear nuevo evento
  const createEventBtn = document.getElementById('createNewEventBtn');
  createEventBtn.addEventListener('click', () => {
    openCreateEventModal();
  });

  // guardar evento
  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    await saveEvent();
  });

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
  document.getElementById("count-events").textContent = events.length;

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

    const trialIcon = event.trial == 1
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
      `¿Estás seguro que quieres eliminar el cliente <strong>${client.name}</strong>?`;

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

// Poblamos el select de clientes desde la variable clients (llámalo después de loadClients)
function populateClientSelect() {
  const sel = document.getElementById('clientSelect');
  sel.innerHTML = `<option value="">Seleccionar cliente...</option>`;
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (ID:${c.id})`;
    sel.appendChild(opt);
  });
}

/* Abrir modal en modo create */
function openCreateEventModal() {
  const form = document.getElementById('eventForm');
  form.dataset.action = 'create';
  form.removeAttribute('data-id');
  document.getElementById('eventId').value = '';
  form.reset();

  // Asegurarse que el select de clientes está poblado
  populateClientSelect();

  document.getElementById('eventModalTitle').textContent = 'Crear Evento';
  // esconder previews si los hubiera
  document.getElementById('previewLogo').classList.add('d-none');
  document.getElementById('urlPreview').classList.add('d-none');

  eventModal.show();
}

/* Abrir modal en modo edit */
function openEditEventModal(eventObj) {
  const form = document.getElementById('eventForm');
  form.dataset.action = 'edit';
  form.dataset.id = eventObj.id;
  document.getElementById('eventId').value = eventObj.id;

  // Poblamos campos
  document.getElementById('code').value = eventObj.code || '';
  document.getElementById('name').value = eventObj.name || '';
  document.getElementById('language').value = eventObj.language || 'es';
  document.getElementById('status').value = eventObj.status || 'OPE';
  document.getElementById('start').value = eventObj.start.slice(0, 10) || '';
  document.getElementById('end').value = eventObj.end.slice(0, 10) || '';
  document.getElementById('password').value = eventObj.password || '';
  document.getElementById('eventurl').value = eventObj.eventurl || '';
  document.getElementById('eventlogo').value = eventObj.eventlogo || '';
  document.getElementById('min_styles').value = eventObj.min_styles || '';
  document.getElementById('autorefresh_minutes').value = eventObj.autorefresh_minutes || '';
  document.getElementById('judges_to_vote').value = eventObj.judges_to_vote || '';
  document.getElementById('category_class_type').value = eventObj.category_class_type || '';
  document.getElementById('license').value = eventObj.license || 'small';

  // switches -> convertir 1/0 a checkbox
  document.getElementById('visible').checked = (Number(eventObj.visible) === 1);
  document.getElementById('trial').checked = (Number(eventObj.trial) === 1);
  document.getElementById('visible_judges').checked = (Number(eventObj.visible_judges) === 1);
  document.getElementById('visible_participants').checked = (Number(eventObj.visible_participants) === 1);
  document.getElementById('visible_schedule').checked = (Number(eventObj.visible_schedule) === 1);
  document.getElementById('visible_results').checked = (Number(eventObj.visible_results) === 1);
  document.getElementById('has_penalties').checked = (Number(eventObj.has_penalties) === 1);

  // cliente (asegurar poblado)
  populateClientSelect();
  document.getElementById('clientSelect').value = eventObj.client_id || '';

  // mostrar previews si corresponde
  updateLogoPreview();
  updateUrlPreview();

  document.getElementById('eventModalTitle').textContent = 'Editar Evento';
  eventModal.show();
}

/* Guardar (create / update) */
async function saveEvent() {
  const form = document.getElementById('eventForm');
  const action = form.dataset.action;
  const id = form.dataset.id;

  const data = {
    code: document.getElementById('code').value.trim(),
    name: document.getElementById('name').value.trim(),
    language: document.getElementById('language').value,
    status: document.getElementById('status').value,
    start: document.getElementById('start').value || null,
    end: document.getElementById('end').value || null,
    password: parseInt(document.getElementById('password').value, 10) || 0,
    eventurl: document.getElementById('eventurl').value.trim() || null,
    eventlogo: document.getElementById('eventlogo').value.trim() || null,
    client_id: parseInt(document.getElementById('clientSelect').value, 10) || null,
    visible: document.getElementById('visible').checked ? 1 : 0,
    trial: document.getElementById('trial').checked ? 1 : 0,
    min_styles: parseInt(document.getElementById('min_styles').value, 10) || null,
    autorefresh_minutes: parseInt(document.getElementById('autorefresh_minutes').value, 10) || 0,
    judges_to_vote: parseInt(document.getElementById('judges_to_vote').value, 10) || 0,
    category_class_type: document.getElementById('category_class_type').value || '',
    license: document.getElementById('license').value || 'small',
    visible_judges: document.getElementById('visible_judges').checked ? 1 : 0,
    visible_participants: document.getElementById('visible_participants').checked ? 1 : 0,
    visible_schedule: document.getElementById('visible_schedule').checked ? 1 : 0,
    visible_results: document.getElementById('visible_results').checked ? 1 : 0,
    has_penalties: document.getElementById('has_penalties').checked ? 1 : 0
  };

  try {
    let res;
    if (action === 'create') {
      res = await fetch(`${API_BASE_URL}/api/events/admin`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } else {
      res = await fetch(`${API_BASE_URL}/api/events/admin/${id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Error saving event'}));
      showMessageModal(err.error || 'Error saving event', 'Error');
      return;
    }

    // refrescar lista
    await loadEvents();
    await loadClients();
    eventModal.hide();
  } catch (err) {
    console.error('Error saving event:', err);
    showMessageModal('Error saving event', 'Error');
  }
}

/* Eliminar evento */
async function deleteEvent(id) {
  const deleteModalEl = document.getElementById('deleteModal');
  const deleteModal = bootstrap.Modal.getInstance(deleteModalEl);

  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      if (deleteModal) deleteModal.hide();
      const errData = await res.json();
      showMessageModal(errData.error || 'Error deleting event', 'Error');
      return;
    }
    deleteModal.hide();
  } catch (err) {
    console.error('Error deleting event:', err);
    if (deleteModal) deleteModal.hide(); // <-- igual aquí
    showMessageModal('Error deleting event', 'Error');
  }
}

/* Duplicar evento (copia simple) */
function openDuplicateModal(eventId) {
  const modal = new bootstrap.Modal(document.getElementById('duplicateModal'));
  const confirmBtn = document.getElementById('confirmDuplicateBtn');

  // Limpiamos listeners anteriores
  confirmBtn.replaceWith(confirmBtn.cloneNode(true));
  const newConfirmBtn = document.getElementById('confirmDuplicateBtn');

  // Guardamos el ID actual y lo asignamos al listener
  newConfirmBtn.addEventListener('click', () => {
    const type = document.getElementById('duplicateType').value;
    modal.hide();
    duplicateEvent(eventId, type);
  });

  modal.show();
}

async function duplicateEvent(eventId, duplicateType) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${eventId}/duplicate`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: duplicateType })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error duplicating event' }));
      showMessageModal(err.error || 'Error duplicating event', 'Error');
      return;
    }

    await loadEvents();
    showToast('Evento duplicado correctamente', 'success');

  } catch (err) {
    console.error('Error duplicating event:', err);
    showMessageModal('Error duplicating event', 'Error');
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center text-bg-${type} border-0 mb-2`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toastEl);

  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();

  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}


/* Clicks en la tabla de eventos: editar, borrar, duplicar */
document.addEventListener('click', (ev) => {
  const editBtn = ev.target.closest('.btn-edit-event');
  const deleteBtn = ev.target.closest('.btn-delete-event');
  const dupBtn = ev.target.closest('.btn-duplicate-event');

  if (editBtn) {
    const tr = editBtn.closest('tr');
    const id = tr.dataset.id;
    const evt = events.find(e => e.id == id);
    if (evt) openEditEventModal(evt);
  }

  if (deleteBtn) {
    const tr = deleteBtn.closest('tr');
    const id = tr.dataset.id;
    const evt = events.find(e => e.id == id);

    if (!evt) return;
    document.getElementById('deleteModalMessage').innerHTML =
      `¿Estás seguro que quieres eliminar el evento <strong>${evt.name}</strong>?`;

    document.getElementById('confirmDeleteBtn').onclick = async () => {
      await deleteEvent(id);
      await loadEvents();
      const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
      deleteModal.hide();
    };

    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
  }

  if (dupBtn) {
    const tr = dupBtn.closest('tr');
    const id = tr.dataset.id;
    openDuplicateModal(id);
  }
});

/* =========================
   Previews: logo & URL
   ========================= */
function updateLogoPreview() {
  const url = document.getElementById('eventlogo').value.trim();
  const img = document.getElementById('previewLogo');

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    img.src = url;
    img.classList.remove('d-none');
  } else {
    img.classList.add('d-none');
  }
}

function updateUrlPreview() {
  const url = document.getElementById('eventurl').value.trim();
  const previewDiv = document.getElementById('urlPreview');
  const link = document.getElementById('urlPreviewLink');
  const text = document.getElementById('urlPreviewText');

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    link.href = url;
    text.textContent = url;
    previewDiv.classList.remove('d-none');
  } else {
    previewDiv.classList.add('d-none');
  }
}