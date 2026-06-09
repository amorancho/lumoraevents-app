//var title = 'General Configuration';
const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();
  await ensureTranslationsReady();

  initQrModal();
  initPosterModal();
  initExportEventModal();
  initStatusToggleModal();
  initEventInfoModal();
  initTooltips();

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
        showMessageModal(errData.error || t('error_update_event'), t('error_title'));
      }
    } catch (err) {
      console.error('Error al actualizar visibilidad:', err);
      toggleVisible.checked = !isMakingVisible; // revertir toggle si hay error
    }
  });

  applyCloseButtonAriaLabels();
  await loadEventData(eventId);

  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    await saveEventData(eventId);
  });

  document.getElementById('eventlogo').addEventListener('input', updateLogoPreview);

});

let currentEventStatus = null;
const POSTER_DEFAULT_PHRASE = 'TU COMPETICIÓN EN TIEMPO REAL';
const POSTER_MAX_PHRASE_LENGTH = 70;
const POSTER_MIN_DIMENSION = 300;
const POSTER_UPLOAD_MIN_WIDTH = 800;
const POSTER_FILE_FIELD_NAMES = ['logo', 'logoFile', 'file', 'posterLogo', 'poster_logo'];
const POSTER_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const PLANB_EXPORT_MODAL_COPY = {
  en: {
    prompt: 'Choose the export format for Plan B.',
    info: 'The export will generate a ZIP file with one PDF or Excel file per judge, depending on the selected format.',
    loadingHint: 'This process may take a few seconds. Please do not close or refresh the page while export is in progress.'
  },
  es: {
    prompt: 'Elige el formato de exportacion del Plan B.',
    info: 'La exportacion generara un ZIP con un PDF o un Excel por cada juez, segun el formato seleccionado.',
    loadingHint: 'Este proceso puede tardar unos segundos. No cierres ni recargues la pagina durante la exportacion.'
  },
  fr: {
    prompt: 'Choisissez le format d export Plan B.',
    info: 'L export generera un fichier ZIP avec un PDF ou un fichier Excel par juge, selon le format choisi.',
    loadingHint: 'Ce processus peut prendre quelques secondes. Ne fermez pas et ne rechargez pas la page pendant l export.'
  },
  it: {
    prompt: 'Scegli il formato di esportazione del Plan B.',
    info: 'L esportazione generera un file ZIP con un PDF o un file Excel per ogni giudice, in base al formato selezionato.',
    loadingHint: 'Questo processo puo richiedere alcuni secondi. Non chiudere o ricaricare la pagina durante l esportazione.'
  },
  pt: {
    prompt: 'Escolha o formato de exportacao do Plan B.',
    info: 'A exportacao vai gerar um ficheiro ZIP com um PDF ou um ficheiro Excel por juiz, conforme o formato selecionado.',
    loadingHint: 'Este processo pode demorar alguns segundos. Nao feche nem atualize a pagina durante a exportacao.'
  }
};
const EVENT_INFO_DEFAULT_DATA = Object.freeze({
  id: null,
  address: null,
  location: null,
  country: null,
  location_maps: null,
  email_contact: null,
  phone_contact: null,
  organizer: null,
  bases_document: null,
  event_description: null
});
const EVENT_INFO_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'ol', 'ul', 'li', 'a', 'h2', 'h3', 'blockquote'];
const EVENT_INFO_ALLOWED_ATTRIBUTES = ['href', 'target', 'rel'];
const EVENT_INFO_ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const eventInfoState = {
  modal: null,
  editor: null,
  countrySelect: null,
  initialSnapshot: '',
  skipCloseGuard: false,
  loading: false,
  saving: false
};

function applyCloseButtonAriaLabels() {
  const closeLabel = t('close');
  document.querySelectorAll('.btn-close[data-i18n-title="close"]').forEach((btn) => {
    btn.setAttribute('aria-label', closeLabel);
  });
}

function syncPlanBExportModalCopy() {
  const promptEl = document.querySelector('#exportEventModal [data-i18n="export_event_format_prompt"]');
  const infoEl = document.querySelector('#exportEventModal [data-i18n="export_event_info"]');
  const language = String(localStorage.getItem('lang') || getEvent()?.language || 'en').toLowerCase();
  const copy = PLANB_EXPORT_MODAL_COPY[language] || PLANB_EXPORT_MODAL_COPY.en;

  if (promptEl) {
    promptEl.textContent = t('export_event_format_prompt', copy.prompt);
  }

  if (infoEl) {
    infoEl.innerHTML = `${copy.info}<br>${copy.loadingHint}`;
  }
}

function ensurePlanBExportFormatButtons(modalEl) {
  if (!modalEl) return null;

  let buttonsContainer = modalEl.querySelector('#exportEventFormatButtons');
  if (buttonsContainer) {
    return buttonsContainer;
  }

  const modalBody = modalEl.querySelector('.modal-body');
  if (!modalBody) return null;

  buttonsContainer = document.createElement('div');
  buttonsContainer.id = 'exportEventFormatButtons';
  buttonsContainer.className = 'd-grid gap-2 mt-4';
  buttonsContainer.innerHTML = `
    <button type="button" class="btn btn-outline-danger fw-semibold" id="exportEventPdfBtn">
      <i class="bi bi-file-earmark-pdf me-2"></i>PDF
    </button>
    <button type="button" class="btn btn-outline-success fw-semibold" id="exportEventExcelBtn">
      <i class="bi bi-file-earmark-excel me-2"></i>Excel
    </button>
  `;

  const applyRestrictionContainer = modalBody.querySelector('#exportApplyRestrictionContainer');
  if (applyRestrictionContainer) {
    applyRestrictionContainer.insertAdjacentElement('afterend', buttonsContainer);
  } else {
    modalBody.appendChild(buttonsContainer);
  }

  return buttonsContainer;
}

function initExportEventModal() {
  const exportBtn = document.getElementById('exportEventBtn');
  const modalEl = document.getElementById('exportEventModal');
  const buttonsContainer = ensurePlanBExportFormatButtons(modalEl);
  const exportPdfBtn = buttonsContainer?.querySelector('#exportEventPdfBtn');
  const exportExcelBtn = buttonsContainer?.querySelector('#exportEventExcelBtn');
  const applyRestrictionContainer = document.getElementById('exportApplyRestrictionContainer');
  const applyRestrictionCheck = document.getElementById('exportApplyRestrictionCheck');

  if (!exportBtn || !modalEl || !exportPdfBtn || !exportExcelBtn) return;

  const modal = new bootstrap.Modal(modalEl);
  const actionButtons = [exportPdfBtn, exportExcelBtn];
  const dismissButtons = Array.from(modalEl.querySelectorAll('.btn-close, [data-bs-dismiss="modal"]'));
  let exportInProgress = false;

  syncPlanBExportModalCopy();

  const syncRestrictionOption = () => {
    const { canApplyRestriction } = getPlanBRestrictionState();
    if (applyRestrictionContainer) {
      applyRestrictionContainer.classList.toggle('d-none', !canApplyRestriction);
    }
    if (applyRestrictionCheck && !canApplyRestriction) {
      applyRestrictionCheck.checked = false;
    }
  };

  const setExportLoadingState = (activeButton, isLoading) => {
    exportInProgress = isLoading;
    exportBtn.disabled = isLoading;

    actionButtons.forEach((button) => {
      if (button === activeButton) {
        setButtonLoading(button, isLoading, t('exporting'));
        return;
      }
      button.disabled = isLoading;
    });

    dismissButtons.forEach((button) => {
      button.disabled = isLoading;
    });
  };

  modalEl.addEventListener('hide.bs.modal', (event) => {
    if (exportInProgress) {
      event.preventDefault();
    }
  });

  modalEl.addEventListener('show.bs.modal', () => {
    syncRestrictionOption();
  });

  exportBtn.addEventListener('click', () => {
    if (exportBtn.disabled) return;

    if (applyRestrictionCheck) {
      applyRestrictionCheck.checked = false;
    }

    modal.show();
  });

  const handleExport = async (format, triggerButton) => {
    try {
      if (triggerButton.disabled) return;

      const { applyRestrictionVoting } = getPlanBRestrictionState();
      setExportLoadingState(triggerButton, true);
      await downloadEventPlanBExport(format, applyRestrictionVoting);
      setExportLoadingState(triggerButton, false);
      modal.hide();
    } catch (err) {
      console.error('Export error:', err);
      showMessageModal(err?.message || t('error_export_event'), t('error_title'));
    } finally {
      setExportLoadingState(triggerButton, false);
    }
  };

  exportPdfBtn.addEventListener('click', async () => {
    await handleExport('pdf', exportPdfBtn);
  });

  exportExcelBtn.addEventListener('click', async () => {
    await handleExport('excel', exportExcelBtn);
  });
}

function getPlanBRestrictionState() {
  const restrictVotingInput = document.getElementById('restrict_voting');
  const applyRestrictionCheck = document.getElementById('exportApplyRestrictionCheck');
  const restrictVotingValue = Number(restrictVotingInput?.value ?? 0);
  const canApplyRestriction = Number.isFinite(restrictVotingValue) && restrictVotingValue > 0;

  return {
    canApplyRestriction,
    applyRestrictionVoting: canApplyRestriction && Boolean(applyRestrictionCheck?.checked)
  };
}

async function downloadEventPlanBExport(format, applyRestrictionVoting) {
  const id = getEvent()?.id;
  if (!id) {
    throw new Error(t('error_event_not_loaded'));
  }

  const normalizedFormat = format === 'excel' ? 'excel' : 'pdf';
  const planbUrl = new URL(`${API_BASE_URL}/api/events/${id}/planb`);
  planbUrl.searchParams.set('format', normalizedFormat);
  planbUrl.searchParams.set('apply_restrictions', applyRestrictionVoting ? 'true' : 'false');

  const res = await fetch(planbUrl.toString(), { method: 'GET' });
  if (!res.ok) {
    let message = t('error_export_event');
    try {
      const data = await res.json();
      message = data?.error || data?.message || message;
    } catch {
      // ignore json parse errors for non-json bodies
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const filename = getFilenameFromContentDisposition(disposition) || makeExportFilename(getEvent(), normalizedFormat);

  downloadBlob(blob, filename);
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
      ? t('event_status_modal_title_open')
      : t('event_status_modal_title_finish');
    messageEl.textContent = isFinished
      ? t('event_status_modal_msg_open')
      : t('event_status_modal_msg_finish');
    if (!isFinished) {
      const details = [
        t('event_status_finish_detail_1'),
        t('event_status_finish_detail_2'),
        t('event_status_finish_detail_3'),
        t('event_status_finish_detail_4')
      ];
      const listItems = details.map((item) => `<li>${item}</li>`).join('');
      detailsEl.innerHTML = `
        <div class="fw-semibold mb-1">${t('event_status_finish_info_title')}</div>
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
      if (!res.ok) throw new Error(t('event_status_error_update'));

      currentEventStatus = isFinished ? 'OPE' : 'FIN';
      updateEventStatusUI(currentEventStatus);
      modal.hide();
      showAlert('success', isFinished
        ? t('event_status_success_open')
        : t('event_status_success_finish'));
    } catch (err) {
      console.error('Error updating event status:', err);
      showMessageModal(t('event_status_error_update'), t('error_title'));
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
      ? t('event_status_open_btn')
      : t('event_status_finish_btn');
  }
}

function setButtonLoading(button, isLoading, loadingText = t('loading')) {
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

function initEventInfoModal() {
  const modalEl = document.getElementById('eventInfoModal');
  const formEl = document.getElementById('eventInfoForm');
  const openBtn = document.getElementById('openEventInfoBtn');
  const saveBtn = document.getElementById('saveEventInfoBtn');
  const countryField = document.getElementById('eventInfoCountry');

  if (!modalEl || !formEl || !openBtn || !saveBtn) return;

  if (!window.bootstrap?.Modal || !window.Quill || !window.DOMPurify) {
    console.error('Event info modal dependencies are not available.');
    openBtn.addEventListener('click', () => {
      showMessageModal(t('event_info_editor_unavailable', 'The event info editor is not available.'), t('error_title'));
    });
    return;
  }

  const modal = new bootstrap.Modal(modalEl);
  const editor = new Quill('#eventInfoDescriptionEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean']
      ]
    },
    formats: ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link']
  });

  editor.root.setAttribute('spellcheck', 'true');

  eventInfoState.modal = modal;
  eventInfoState.editor = editor;
  initEventInfoCountrySelect(countryField);

  openBtn.addEventListener('click', async () => {
    if (eventInfoState.loading || eventInfoState.saving) return;

    const currentEvent = getEvent();
    if (!currentEvent?.id) {
      showMessageModal(t('error_event_not_loaded'), t('error_title'));
      return;
    }

    eventInfoState.loading = true;
    setButtonLoading(openBtn, true, t('loading'));

    try {
      const eventInfo = await fetchEventInfoData(currentEvent.id);
      populateEventInfoForm(eventInfo);
      eventInfoState.initialSnapshot = getEventInfoSnapshot();
      modal.show();
    } catch (error) {
      console.error('Error loading event info:', error);
      showMessageModal(error?.message || t('event_info_loading_error'), t('error_title'));
    } finally {
      eventInfoState.loading = false;
      setButtonLoading(openBtn, false);
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (eventInfoState.loading || eventInfoState.saving) return;

    if (!formEl.reportValidity()) {
      return;
    }

    const currentEvent = getEvent();
    if (!currentEvent?.id) {
      showMessageModal(t('error_event_not_loaded'), t('error_title'));
      return;
    }

    const payload = buildEventInfoPayload(currentEvent.id);

    eventInfoState.saving = true;
    setEventInfoBusyState(true);
    setButtonLoading(saveBtn, true, t('guardando'));

    try {
      await saveEventInfoData(currentEvent.id, payload);
      eventInfoState.initialSnapshot = JSON.stringify(payload);
      eventInfoState.skipCloseGuard = true;
      modal.hide();
      showAlert('success', t('event_info_saved'));
    } catch (error) {
      console.error('Error saving event info:', error);
      showMessageModal(error?.message || t('event_info_saving_error'), t('error_title'));
    } finally {
      eventInfoState.saving = false;
      setEventInfoBusyState(false);
      setButtonLoading(saveBtn, false);
    }
  });

  modalEl.addEventListener('hide.bs.modal', (event) => {
    if (eventInfoState.skipCloseGuard) {
      return;
    }

    if (eventInfoState.loading || eventInfoState.saving) {
      event.preventDefault();
      return;
    }

    if (!hasEventInfoUnsavedChanges()) {
      return;
    }

    event.preventDefault();
    const shouldDiscard = window.confirm(t('event_info_unsaved_confirm'));
    if (!shouldDiscard) {
      return;
    }

    eventInfoState.skipCloseGuard = true;
    window.setTimeout(() => modal.hide(), 0);
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    eventInfoState.skipCloseGuard = false;
  });
}

function setEventInfoBusyState(isBusy) {
  const modalEl = document.getElementById('eventInfoModal');
  const formEl = document.getElementById('eventInfoForm');

  if (modalEl) {
    modalEl.classList.toggle('event-info-loading', isBusy);
    modalEl.querySelectorAll('.btn-close, [data-bs-dismiss="modal"]').forEach((button) => {
      button.disabled = isBusy;
    });
  }

  if (formEl) {
    formEl.querySelectorAll('input, textarea, select').forEach((field) => {
      field.disabled = isBusy;
    });
  }

  if (eventInfoState.countrySelect) {
    if (isBusy) {
      eventInfoState.countrySelect.disable();
    } else {
      eventInfoState.countrySelect.enable();
    }
  }

  if (eventInfoState.editor) {
    eventInfoState.editor.enable(!isBusy);
  }
}

async function fetchEventInfoData(eventId) {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/info`);
  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, t('event_info_loading_error')));
  }

  const data = await response.json();
  return { ...EVENT_INFO_DEFAULT_DATA, ...(data || {}), id: eventId };
}

async function saveEventInfoData(eventId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/info`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await extractApiErrorMessage(response, t('event_info_saving_error')));
  }
}

async function extractApiErrorMessage(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data?.error || data?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function populateEventInfoForm(data) {
  const normalized = normalizeEventInfoData(data);

  const fieldMap = {
    eventInfoAddress: normalized.address,
    eventInfoLocation: normalized.location,
    eventInfoMaps: normalized.location_maps,
    eventInfoEmail: normalized.email_contact,
    eventInfoPhone: normalized.phone_contact,
    eventInfoOrganizer: normalized.organizer,
    eventInfoBases: normalized.bases_document
  };

  Object.entries(fieldMap).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = value;
    }
  });

  setEventInfoCountryValue(normalized.country);
  setEventInfoEditorHtml(normalized.event_description);
}

function normalizeEventInfoData(data) {
  return {
    id: data?.id ?? EVENT_INFO_DEFAULT_DATA.id,
    address: String(data?.address ?? ''),
    location: String(data?.location ?? ''),
    country: normalizeCountryCode(data?.country),
    location_maps: String(data?.location_maps ?? ''),
    email_contact: String(data?.email_contact ?? ''),
    phone_contact: String(data?.phone_contact ?? ''),
    organizer: String(data?.organizer ?? ''),
    bases_document: String(data?.bases_document ?? ''),
    event_description: sanitizeEventInfoHtml(String(data?.event_description ?? ''))
  };
}

function buildEventInfoPayload(eventId) {
  return {
    id: eventId,
    address: normalizeOptionalField(document.getElementById('eventInfoAddress')?.value),
    location: normalizeOptionalField(document.getElementById('eventInfoLocation')?.value),
    country: normalizeOptionalField(normalizeCountryCode(document.getElementById('eventInfoCountry')?.value)),
    location_maps: normalizeOptionalField(document.getElementById('eventInfoMaps')?.value),
    email_contact: normalizeOptionalField(document.getElementById('eventInfoEmail')?.value),
    phone_contact: normalizeOptionalField(document.getElementById('eventInfoPhone')?.value),
    organizer: normalizeOptionalField(document.getElementById('eventInfoOrganizer')?.value),
    bases_document: normalizeOptionalField(document.getElementById('eventInfoBases')?.value),
    event_description: normalizeOptionalField(getEventInfoEditorHtml())
  };
}

function normalizeOptionalField(value) {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n').trim();
  return normalized || null;
}

function normalizeCountryCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function initEventInfoCountrySelect(selectEl) {
  if (!selectEl) return;

  const countryList = typeof countries !== 'undefined' && Array.isArray(countries) ? countries : null;

  if (selectEl.dataset.countriesLoaded !== 'true' && countryList) {
    countryList.forEach((country) => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = `${country.code} - ${country.name}`;
      selectEl.appendChild(option);
    });
    selectEl.dataset.countriesLoaded = 'true';
  }

  if (window.TomSelect) {
    eventInfoState.countrySelect = new TomSelect(selectEl, {
      maxOptions: 200,
      placeholder: 'Type to search...',
      allowEmptyOption: true
    });
  }
}

function ensureEventInfoCountryOption(value) {
  const normalizedValue = normalizeCountryCode(value);
  if (!normalizedValue) return;

  const selectEl = document.getElementById('eventInfoCountry');
  if (!selectEl) return;

  const hasOption = Array.from(selectEl.options).some((option) => option.value === normalizedValue);
  if (hasOption) return;

  const option = document.createElement('option');
  option.value = normalizedValue;
  option.textContent = `${normalizedValue} - ${normalizedValue}`;
  selectEl.appendChild(option);

  if (eventInfoState.countrySelect) {
    eventInfoState.countrySelect.addOption({
      value: normalizedValue,
      text: option.textContent
    });
  }
}

function setEventInfoCountryValue(value) {
  const normalizedValue = normalizeCountryCode(value);
  ensureEventInfoCountryOption(normalizedValue);

  if (eventInfoState.countrySelect) {
    if (normalizedValue) {
      eventInfoState.countrySelect.setValue(normalizedValue, true);
    } else {
      eventInfoState.countrySelect.clear(true);
    }
    return;
  }

  const selectEl = document.getElementById('eventInfoCountry');
  if (selectEl) {
    selectEl.value = normalizedValue;
  }
}

function setEventInfoEditorHtml(html) {
  const editor = eventInfoState.editor;
  if (!editor) return;

  const sanitizedHtml = sanitizeEventInfoHtml(html);
  if (!sanitizedHtml) {
    editor.setText('', 'silent');
    return;
  }

  editor.setContents(editor.clipboard.convert(sanitizedHtml), 'silent');
}

function getEventInfoEditorHtml() {
  const rawHtml = eventInfoState.editor?.root?.innerHTML || '';
  return sanitizeEventInfoHtml(rawHtml);
}

function sanitizeEventInfoHtml(rawHtml) {
  if (!window.DOMPurify) return '';

  const sanitized = window.DOMPurify.sanitize(String(rawHtml || ''), {
    ALLOWED_TAGS: EVENT_INFO_ALLOWED_TAGS,
    ALLOWED_ATTR: EVENT_INFO_ALLOWED_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style'],
    KEEP_CONTENT: true
  });

  const container = document.createElement('div');
  container.innerHTML = sanitized;

  container.querySelectorAll('a').forEach((link) => {
    const href = String(link.getAttribute('href') || '').trim();
    if (!isSafeEventInfoLink(href)) {
      link.replaceWith(document.createTextNode(link.textContent || ''));
      return;
    }

    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  const normalizedHtml = container.innerHTML.trim();
  return isMeaningfulEventInfoHtml(normalizedHtml) ? normalizedHtml : '';
}

function isSafeEventInfoLink(href) {
  if (!href) return false;

  try {
    const url = new URL(href, window.location.origin);
    return EVENT_INFO_ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isMeaningfulEventInfoHtml(html) {
  if (!html) return false;

  const container = document.createElement('div');
  container.innerHTML = html;
  const textContent = String(container.textContent || '')
    .replace(/\u00a0/g, ' ')
    .trim();

  return textContent.length > 0;
}

function getEventInfoSnapshot() {
  const currentEventId = getEvent()?.id ?? null;
  return JSON.stringify(buildEventInfoPayload(currentEventId));
}

function hasEventInfoUnsavedChanges() {
  if (!eventInfoState.initialSnapshot) return false;
  return eventInfoState.initialSnapshot !== getEventInfoSnapshot();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || t('download_default_filename');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeExportFilename(event, format = 'pdf') {
  const baseName = (event?.name || t('event_default_name')).trim();
  const safeBase = sanitizeFilename(baseName) || t('event_default_name');
  const normalizedFormat = format === 'excel' ? 'excel' : 'pdf';
  return `${safeBase} - planb-${normalizedFormat}.zip`;
}

function makePosterFilename(event) {
  const baseName = (event?.name || t('event_default_name')).trim();
  const safeBase = sanitizeFilename(baseName) || t('event_default_name');
  return `${safeBase} - ${t('poster_file_suffix', 'Poster.pdf')}`;
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '-') // windows forbidden chars
    .replace(/[\u0000-\u001F\u007F]/g, '') // control chars
    .replace(/\s+/g, ' ')
    .trim();
}

function getFilenameFromContentDisposition(dispositionHeader) {
  if (!dispositionHeader || typeof dispositionHeader !== 'string') return null;

  const utf8Match = dispositionHeader.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // ignore malformed uri encoding
    }
  }

  const asciiMatch = dispositionHeader.match(/filename=\"?([^\";]+)\"?/i);
  return asciiMatch?.[1]?.trim() || null;
}

function isPosterLogoFileTypeAllowed(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '');

  if (POSTER_ALLOWED_MIME_TYPES.has(mimeType)) {
    return true;
  }

  return /\.(png|jpe?g)$/i.test(name);
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error(t('poster_error_invalid_logo_file')));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      cleanup();
      resolve({ width, height });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(t('poster_error_invalid_logo_file')));
    };

    image.src = objectUrl;
  });
}

function loadPosterImage(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error(t('poster_error_invalid_logo_file')));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      resolve({
        image,
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0,
        cleanup
      });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(t('poster_error_invalid_logo_file')));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error(t('poster_error_invalid_logo_file')));
    }, type, quality);
  });
}

async function normalizePosterLogoForUpload(file) {
  const { image, width, height, cleanup } = await loadPosterImage(file);

  try {
    if (width >= POSTER_UPLOAD_MIN_WIDTH) {
      return file;
    }

    const scale = POSTER_UPLOAD_MIN_WIDTH / Math.max(width, 1);
    const targetWidth = Math.max(POSTER_UPLOAD_MIN_WIDTH, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(t('poster_error_invalid_logo_file'));
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, outputType, 0.92);

    return new File([blob], file.name, {
      type: outputType,
      lastModified: file.lastModified
    });
  } finally {
    cleanup();
  }
}

async function uploadEventPoster(eventId, logoFile, phrase) {
  let lastErrorMessage = t('error_export_poster');

  for (let index = 0; index < POSTER_FILE_FIELD_NAMES.length; index += 1) {
    const fieldName = POSTER_FILE_FIELD_NAMES[index];
    const formData = new FormData();
    formData.append(fieldName, logoFile);
    formData.append('phrase', phrase);
    formData.append('frase', phrase);

    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/poster`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      return response;
    }

    const errorMessage = await getResponseErrorMessage(response, t('error_export_poster'));
    lastErrorMessage = errorMessage;

    if (!shouldRetryPosterUpload(response.status, errorMessage) || index === POSTER_FILE_FIELD_NAMES.length - 1) {
      throw new Error(errorMessage);
    }
  }

  throw new Error(lastErrorMessage);
}

async function getResponseErrorMessage(response, fallbackMessage) {
  try {
    const text = await response.text();
    if (!text) return fallbackMessage;

    try {
      const data = JSON.parse(text);
      return data?.error || data?.message || text || fallbackMessage;
    } catch {
      return text;
    }
  } catch {
    return fallbackMessage;
  }
}

function shouldRetryPosterUpload(status, message) {
  const normalizedMessage = String(message || '').toLowerCase();
  const looksLikeFieldMappingIssue = /unexpected field|limit_unexpected_file|unknown field|missing file|no file|required file|req\.file|logo.*required/.test(normalizedMessage);

  if (looksLikeFieldMappingIssue) {
    return true;
  }

  return [400, 422].includes(Number(status)) && /missing|required/.test(normalizedMessage);
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
    downloadDataUrl(dataUrl, filename || t('qr_default_filename'));
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
      if (!res.ok) throw new Error(t('error_loading_qr'));
      const data = await res.json();

      if (!data?.dataUrl) throw new Error(t('error_invalid_qr_response'));

      qrImage.src = data.dataUrl;
      downloadBtn.dataset.qrDataUrl = data.dataUrl;
      downloadBtn.dataset.qrFilename = `${data.eventId ?? getEvent().id}_qr.png`;
      downloadBtn.disabled = false;
    } catch (err) {
      console.error('Error loading QR:', err);
      showMessageModal(err?.message || t('error_loading_qr'), t('error_title'));
    }
  });
}

function initPosterModal() {
  const posterBtn = document.getElementById('posterBtn');
  const modalEl = document.getElementById('posterModal');
  const generateBtn = document.getElementById('generatePosterBtn');
  const logoInput = document.getElementById('posterLogoInput');
  const phraseInput = document.getElementById('posterPhraseInput');
  const phraseCounter = document.getElementById('posterPhraseCounter');

  if (!posterBtn || !modalEl || !generateBtn || !logoInput || !phraseInput || !phraseCounter) return;

  const modal = new bootstrap.Modal(modalEl);

  const syncPhraseCounter = () => {
    phraseCounter.textContent = `${phraseInput.value.length}/${POSTER_MAX_PHRASE_LENGTH}`;
  };

  const resetPosterForm = () => {
    logoInput.value = '';
    phraseInput.value = POSTER_DEFAULT_PHRASE;
    syncPhraseCounter();
  };

  phraseInput.maxLength = POSTER_MAX_PHRASE_LENGTH;
  phraseInput.addEventListener('input', syncPhraseCounter);

  posterBtn.addEventListener('click', () => {
    if (posterBtn.disabled) return;
    resetPosterForm();
    modal.show();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    resetPosterForm();
  });

  generateBtn.addEventListener('click', async () => {
    const id = getEvent()?.id;
    const logoFile = logoInput.files?.[0] ?? null;
    const phrase = phraseInput.value.trim();

    if (!id) {
      showMessageModal(t('error_event_not_loaded'), t('error_title'));
      return;
    }

    if (!logoFile) {
      showMessageModal(t('poster_error_missing_logo'), t('error_title'));
      return;
    }

    if (!isPosterLogoFileTypeAllowed(logoFile)) {
      showMessageModal(t('poster_error_invalid_logo_type'), t('error_title'));
      return;
    }

    if (phrase.length > POSTER_MAX_PHRASE_LENGTH) {
      showMessageModal(t('poster_error_phrase_too_long'), t('error_title'));
      return;
    }

    try {
      const { width, height } = await readImageDimensions(logoFile);
      if (Math.max(width, height) < POSTER_MIN_DIMENSION) {
        showMessageModal(t('poster_error_small_logo'), t('error_title'));
        return;
      }
    } catch (err) {
      showMessageModal(err?.message || t('poster_error_invalid_logo_file'), t('error_title'));
      return;
    }

    setButtonLoading(generateBtn, true, t('poster_generating'));

    try {
      const uploadFile = await normalizePosterLogoForUpload(logoFile);
      const response = await uploadEventPoster(id, uploadFile, phrase);
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      const filename = getFilenameFromContentDisposition(disposition) || makePosterFilename(getEvent());

      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Error generating poster:', err);
      showMessageModal(err?.message || t('error_export_poster'), t('error_title'));
    } finally {
      setButtonLoading(generateBtn, false);
    }
  });

  resetPosterForm();
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
    if (!res.ok) throw new Error(t('error_loading_event_data'));
    const data = await res.json();

    const f = id => document.getElementById(id);

    const dateFields = ['start', 'end', 'registration_start', 'registration_end'];

    for (let key in data) {
      const input = f(key);
      if (!input) continue;

      if (dateFields.includes(key) && data[key]) {
        // Campo de fecha -> tomar solo YYYY-MM-DD
        input.value = data[key].slice(0, 10);
      } else {
        // Todo lo demas -> asignar tal cual o vacio
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
    showAlert('danger', t('error_loading_event_information'));
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
    restrict_voting: Number(f('restrict_voting').value || 0),
    registration_start: f('registration_start').value || null,
    registration_end: f('registration_end').value || null,
    music_extra_time: Number(f('music_extra_time').value || 0)
  };

  try {
    setButtonLoading(saveBtn, true, t('guardando'));
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(t('error_saving_event_data'));

    showAlert('success', t('success_event_updated'));
  } catch (err) {
    showAlert('danger', t('error_event_update_failed'));
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


