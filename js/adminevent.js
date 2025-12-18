//var title = 'General Configuration';
const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();

  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  initQrModal();
  initExportEventModal();
  //initTooltips();

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

function initExportEventModal() {
  const exportBtn = document.getElementById('exportEventBtn');
  const modalEl = document.getElementById('exportEventModal');
  const confirmBtn = document.getElementById('exportEventConfirmBtn');

  if (!exportBtn || !modalEl || !confirmBtn) return;

  const modal = new bootstrap.Modal(modalEl);

  exportBtn.addEventListener('click', () => {
    if (exportBtn.disabled) return;
    modal.show();
  });

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    modal.hide();

    setButtonLoading(exportBtn, true, 'Exporting...');

    try {
      const id = getEvent()?.id;
      if (!id) throw new Error('Event not loaded');

      const res = await fetch(`${API_BASE_URL}/api/events/${id}/planb`, { method: 'GET' });
      if (!res.ok) {
        let message = 'Error exporting event';
        try {
          const data = await res.json();
          message = data?.error || data?.message || message;
        } catch {
          // ignore json parse errors for non-json bodies
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const filename = makeExportFilename(getEvent());

      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Export error:', err);
      showMessageModal(err?.message || 'Error exporting event', 'Error');
    } finally {
      setButtonLoading(exportBtn, false);
      confirmBtn.disabled = false;
    }
  });
}

function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${loadingText}</span>
    `;
    button.disabled = true;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
  button.disabled = false;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.zip';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeExportFilename(event) {
  const baseName = (event?.name || 'Event').trim();
  const safeBase = sanitizeFilename(baseName) || 'Event';
  return `${safeBase} - Export.zip`;
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '-') // windows forbidden chars
    .replace(/[\u0000-\u001F\u007F]/g, '') // control chars
    .replace(/\s+/g, ' ')
    .trim();
}

function initTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach((tooltipTriggerEl) => {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

function initQrModal() {
  const qrBtn = document.getElementById('qrBtn');
  const modalEl = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const downloadBtn = document.getElementById('downloadQrBtn');

  if (!qrBtn || !modalEl || !qrImage || !downloadBtn) return;

  const modal = new bootstrap.Modal(modalEl);

  downloadBtn.addEventListener('click', () => {
    const dataUrl = downloadBtn.dataset.qrDataUrl;
    const filename = downloadBtn.dataset.qrFilename;
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, filename || 'qr.png');
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    qrImage.removeAttribute('src');
    downloadBtn.disabled = true;
    delete downloadBtn.dataset.qrDataUrl;
    delete downloadBtn.dataset.qrFilename;
  });

  qrBtn.addEventListener('click', async () => {
    qrImage.removeAttribute('src');
    downloadBtn.disabled = true;
    delete downloadBtn.dataset.qrDataUrl;
    delete downloadBtn.dataset.qrFilename;

    modal.show();

    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}/qr?width=300`);
      if (!res.ok) throw new Error('Error loading QR');
      const data = await res.json();

      if (!data?.dataUrl) throw new Error('Invalid QR response');

      qrImage.src = data.dataUrl;
      downloadBtn.dataset.qrDataUrl = data.dataUrl;
      downloadBtn.dataset.qrFilename = `${data.eventId ?? getEvent().id}_qr.png`;
      downloadBtn.disabled = false;
    } catch (err) {
      console.error('Error loading QR:', err);
      showMessageModal('Error loading QR', 'Error');
    }
  });
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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

    if (f('visible_judges')) f('visible_judges').checked = data.visible_judges == 1; 
    if (f('visible_participants')) f('visible_participants').checked = data.visible_participants == 1; 
    if (f('visible_schedule')) f('visible_schedule').checked = data.visible_schedule == 1; 
    if (f('visible_results')) f('visible_results').checked = data.visible_results == 1;
    if (f('visible_statistics')) f('visible_statistics').checked = data.visible_statistics == 1;
    if (f('notice_active')) f('notice_active').checked = data.notice_active == 1;

    const licenseInfo = document.getElementById("licenseInfo");
    if (licenseInfo) {
      const licenseDetails = {
        small: {
          icon: "bi-person",
          name: "Small",
          text: translations["license_small_text"]
        },
        medium: {
          icon: "bi-people",
          name: "Medium",
          text: translations["license_medium_text"]
        },
        large: {
          icon: "bi-people-fill",
          name: "Large",
          text: translations["license_large_text"]
        },
        unlimited: {
          icon: "bi-stars",
          name: "Unlimited",
          text: translations["license_unlimited_text"]
        }
      };

      const license = licenseDetails[data.license];
      if (license) {
        licenseInfo.innerHTML = `
          <span class="badge bg-warning text-dark px-3 py-2 fs-6">
            <i class="bi ${license.icon} me-1"></i>
            <span data-i18n="license">${translations["license"]}</span> <strong>${license.name}</strong> — 
            <span data-i18n="license_${data.license}_text">${license.text}</span>
          </span>

        `;
      } else {
        licenseInfo.textContent = "Licencia desconocida";
      }
    }

    updateLogoPreview();
  } catch (err) {
    showAlert('danger', 'Error loading event information');
    console.error(err);
  }
}


async function saveEventData(eventId) {
  const f = id => document.getElementById(id);
  
  const payload = {
    name: f('name').value.trim(),
    start: f('start').value,
    end: f('end').value,
    status: f('status').value,
    eventlogo: f('eventlogo').value.trim(),
    eventurl: f('eventurl').value.trim(),
    language: f('language').value,    
    visible_judges: f('visible_judges').checked ? 1 : 0,
    visible_participants: f('visible_participants').checked ? 1 : 0,
    visible_schedule: f('visible_schedule').checked ? 1 : 0,
    visible_results: f('visible_results').checked ? 1 : 0,
    visible_statistics: f('visible_statistics').checked ? 1 : 0,
    notice_text: f('notice_text').value.trim(),
    notice_active: f('notice_active').checked ? 1 : 0,
    notice_type: f('notice_type').value
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Error saving event data');

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
  const saveBtn = document.getElementById('saveEventBtn');
  if (!saveBtn) return;

  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  alert.role = 'alert';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  // Insertamos justo después del botón
  saveBtn.parentNode.insertBefore(alert, saveBtn.nextSibling);

  // Eliminamos el alert después de 4 segundos
  setTimeout(() => {
    alert.classList.remove('show'); // animación fade out
    alert.addEventListener('transitionend', () => alert.remove());
  }, 2000);
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
