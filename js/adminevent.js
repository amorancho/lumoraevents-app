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
  initStatusToggleModal();
  //initTooltips();

  const toggleVisible = document.getElementById('visible');

  toggleVisible.addEventListener('change', async () => {
    const isMakingVisible = toggleVisible.checked;

    const { confirmed, notifyJudges } = await showVisibilityModal(
      isMakingVisible
        ? t("visibility_modal_make_visible")
        : t("visibility_modal_hide_event"),
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

  await ensureTranslationsReady();
  await loadEventData(eventId);

  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    await saveEventData(eventId);
  });

  document.getElementById('eventlogo').addEventListener('input', updateLogoPreview);

});

let currentEventStatus = null;

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

function initStatusToggleModal() {
  const toggleBtn = document.getElementById('toggleEventStatusBtn');
  const modalEl = document.getElementById('eventStatusModal');
  const confirmBtn = document.getElementById('eventStatusConfirmBtn');
  const titleEl = document.getElementById('eventStatusModalTitle');
  const messageEl = document.getElementById('eventStatusModalMessage');
  const detailsEl = document.getElementById('eventStatusModalDetails');

  if (!toggleBtn || !modalEl || !confirmBtn || !titleEl || !messageEl || !detailsEl) return;

  const modal = new bootstrap.Modal(modalEl);

  toggleBtn.addEventListener('click', () => {
    if (!currentEventStatus) return;

    const isFinished = currentEventStatus === 'FIN';
    titleEl.textContent = isFinished
      ? t('event_status_modal_title_open', 'Abrir evento')
      : t('event_status_modal_title_finish', 'Finalizar evento');
    messageEl.textContent = isFinished
      ? t('event_status_modal_msg_open', 'Seguro que quieres abrir este evento?')
      : t('event_status_modal_msg_finish', 'Seguro que quieres marcar este evento como finalizado?');
    if (!isFinished) {
      const details = [
        t('event_status_finish_detail_1', 'Ya no se podran realizar votaciones por parte de los jueces'),
        t('event_status_finish_detail_2', 'No se podran modificar datos maestros, jueces, bailarinas y competiciones'),
        t('event_status_finish_detail_3', 'Se enviara un email a las bailarinas con su codigo de acceso para las estadisticas'),
        t('event_status_finish_detail_4', 'Si ha habido registro de inscripciones por parte de escuelas, todos los audios subidos a la plataforma se eliminaran de manera permanente')
      ];
      const listItems = details.map((item) => `<li>${item}</li>`).join('');
      detailsEl.innerHTML = `
        <div class="fw-semibold mb-1">${t('event_status_finish_info_title', 'Al marcar el evento como finalizado:')}</div>
        <ul class="mb-0 ps-3">${listItems}</ul>
      `;
      detailsEl.classList.remove('d-none');
    } else {
      detailsEl.classList.add('d-none');
      detailsEl.innerHTML = '';
    }

    modal.show();
  });

  confirmBtn.addEventListener('click', async () => {
    if (!currentEventStatus) return;

    const isFinished = currentEventStatus === 'FIN';
    const endpoint = isFinished ? 'open' : 'finish';

    confirmBtn.disabled = true;
    toggleBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}/${endpoint}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Error updating event status');

      currentEventStatus = isFinished ? 'OPE' : 'FIN';
      updateEventStatusUI(currentEventStatus);
      modal.hide();
      showAlert('success', isFinished
        ? t('event_status_success_open', 'Evento abierto correctamente')
        : t('event_status_success_finish', 'Evento finalizado correctamente'));
    } catch (err) {
      console.error('Error updating event status:', err);
      showMessageModal(t('event_status_error_update', 'Error actualizando el estado del evento'), 'Error');
    } finally {
      confirmBtn.disabled = false;
      toggleBtn.disabled = false;
    }
  });
}

function updateEventStatusUI(status) {
  const toggleBtn = document.getElementById('toggleEventStatusBtn');
  const statusSelect = document.getElementById('status');

  if (statusSelect) statusSelect.value = status;

  if (toggleBtn) {
    toggleBtn.textContent = status === 'FIN'
      ? t('event_status_open_btn', 'Abrir Evento')
      : t('event_status_finish_btn', 'Marcar evento como finalizado');
  }
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

    const dateFields = ['start', 'end', 'registration_start', 'registration_end'];

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

    const registrationSection = f('registrationConfigSection');
    if (registrationSection) {
      registrationSection.classList.toggle('d-none', data.has_registrations != 1);
    }

    currentEventStatus = data.status;
    updateEventStatusUI(currentEventStatus);

    updateLogoPreview();
  } catch (err) {
    showAlert('danger', 'Error loading event information');
    console.error(err);
  }
}


async function saveEventData(eventId) {
  const f = id => document.getElementById(id);
  const saveBtn = document.getElementById('saveEventBtn');
  
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
    notice_type: f('notice_type').value,
    registration_start: f('registration_start').value || null,
    registration_end: f('registration_end').value || null
  };

  try {
    setButtonLoading(saveBtn, true, t('guardando'));
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
  } finally {
    setButtonLoading(saveBtn, false);
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

