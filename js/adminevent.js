var title = 'General Configuration';
const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();

  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  const toggleVisible = document.getElementById('visible');

  toggleVisible.addEventListener('change', async () => {
    const isMakingVisible = toggleVisible.checked;

    const { confirmed, notifyJudges } = await showVisibilityModal(
      isMakingVisible
        ? "¿Seguro que quieres marcar el evento como visible?"
        : "¿Seguro que quieres ocultar el evento?",
      isMakingVisible // solo mostrar checkbox si está marcando visible
    );

    if (!confirmed) {
      toggleVisible.checked = !isMakingVisible; // revertir toggle
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}/setvisible`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: isMakingVisible ? 1 : 0, notify_judges: notifyJudges })
      });

      if (!response.ok) {
        toggleVisible.checked = !isMakingVisible;
        const errData = await response.json();
        showMessageModal(errData.error || 'Error updating event', 'Error');
      }
    } catch (err) {
      console.error('Error al actualizar visibilidad:', err);
      toggleVisible.checked = !isMakingVisible; // revertir toggle si hay error
    }
  });

  await loadEventData(eventId);

  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    await saveEventData(eventId);
  });

  document.getElementById('eventlogo').addEventListener('input', updateLogoPreview);

  const categorySelect = document.getElementById('category_class_type');
  const minStylesInput = document.getElementById('min_styles');

  function updateMinStylesState() {
    if (categorySelect.value === 'NO') {
      minStylesInput.value = '';      // limpiar valor
      minStylesInput.disabled = true; // deshabilitar input
    } else {
      minStylesInput.disabled = false; // permitir editar
    }
  }

  // Ejecutar al cargar la página
  updateMinStylesState();

  // Ejecutar cada vez que cambie el select
  categorySelect.addEventListener('change', updateMinStylesState);
});

async function loadEventData(eventId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`);
    if (!res.ok) throw new Error('Error loading event data');
    const data = await res.json();

    const f = id => document.getElementById(id);

    const dateFields = ['start', 'end'];

    for (let key in data) {
      const input = f(key);
      if (!input) continue;

      if (dateFields.includes(key) && data[key]) {
        // Campo de fecha → tomar solo YYYY-MM-DD
        input.value = data[key].slice(0, 10);
      } else {
        // Todo lo demás → asignar tal cual o vacío
        input.value = data[key] ?? '';
      }
    }

    if (f('visible')) f('visible').checked = data.visible == 1; 

    updateLogoPreview();
  } catch (err) {
    showAlert('danger', 'Error loading event information');
    console.error(err);
  }
}


async function saveEventData(eventId) {
  const f = id => document.getElementById(id);
  const payload = {
    code: f('code').value.trim(),
    name: f('name').value.trim(),
    start: f('start').value,
    end: f('end').value,
    status: f('status').value,
    eventlogo: f('eventlogo').value.trim(),
    eventurl: f('eventurl').value.trim(),
    client_id: parseInt(f('client_id').value) || null,
    password: parseInt(f('password').value) || null,
    visible: parseInt(f('visible').value) || 0,
    language: f('language').value,
    min_styles: parseInt(f('min_styles').value) || null,
    autorefresh_minutes: parseInt(f('autorefresh_minutes').value) || null,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Error saving event data');
    const result = await res.json();

    showAlert('success', '✅ Event updated successfully!');
  } catch (err) {
    showAlert('danger', '❌ Failed to update event');
    console.error(err);
  }
}


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


function showAlert(type, message) {
  const container = document.querySelector('.container');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  alert.role = 'alert';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  container.prepend(alert);
  setTimeout(() => alert.classList.remove('show'), 4000);
}

function showVisibilityModal(message, showCheckbox = false) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('visibilityModal');
    const modal = new bootstrap.Modal(modalEl);
    const confirmBtn = document.getElementById('visibilityConfirmBtn');
    const cancelBtn = document.getElementById('visibilityCancelBtn');
    const messageEl = document.getElementById('visibilityModalMessage');
    const checkboxContainer = document.getElementById('notifyJudgesContainer');
    const checkbox = document.getElementById('notifyJudgesCheck');

    messageEl.textContent = message;
    checkboxContainer.style.display = showCheckbox ? 'block' : 'none';
    checkbox.checked = false;

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onConfirm = () => {
      cleanup();
      modal.hide();
      resolve({ confirmed: true, notifyJudges: showCheckbox ? checkbox.checked : false });
    };

    const onCancel = () => {
      cleanup();
      modal.hide();
      resolve({ confirmed: false, notifyJudges: false });
    };

    confirmBtn.addEventListener('click', onConfirm, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });

    modal.show();
  });
}