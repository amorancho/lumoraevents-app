var competitions = [];
var masters = [];
var categoriesCatalog = [];
var stylesCatalog = [];
const CRITERIA_PER_JUDGE_ALLOWED_STATUSES = new Set(['CLO']);
const CRITERIA_PER_JUDGE_DELETE_ALLOWED_STATUSES = new Set(['CLO']);
const criteriaPerJudgeState = {
  groups: [],
  groupsByKey: new Map(),
  selectedGroupKey: null,
  selectedCompetitionIds: new Set(),
  pairAssignments: [],
  nextPairRowId: 1,
  hasPersistedChanges: false
};
const criteriaPerJudgeCompetitionState = {
  competitionId: null,
  competition: null,
  criteria: [],
  judges: [],
  pairAssignments: [],
  nextPairRowId: 1,
  canEdit: false,
  canDelete: false,
  loading: false
};
const substituteJudgeState = {
  sourceJudgeId: '',
  replacementJudgeId: '',
  competitions: [],
  selectedCompetitionIds: new Set(),
  loading: false
};
const bulkDeleteCompetitionsState = {
  modal: null,
  items: [],
  isProcessing: false,
  hasExecuted: false,
  deletedCount: 0,
  pendingReload: false
};

const convertStatus = {
  'OPE': 'OPEN',
  'FIN': 'FINISHED', 
  'CLO': 'CLOSED',
  'PRO': 'IN PROGRESS'
}

const statusColor = {
  'OPE': 'warning text-dark',
  'FIN': 'success',
  'CLO': 'danger',
  'PRO': 'primary'
};

var title = 'Competitions';

const allowedRoles = ["admin", "organizer"];

function getCurrentCompetitionFilters() {
  return {
    category: `${document.getElementById('categoryFilter')?.value || ''}`.trim().toLowerCase(),
    style: `${document.getElementById('styleFilter')?.value || ''}`.trim().toLowerCase(),
    withoutParticipants: Boolean(document.getElementById('emptyParticipantsFilter')?.checked)
  };
}

function competitionMatchesFilters(competition, filters = getCurrentCompetitionFilters()) {
  const category = `${competition?.category_name || ''}`.trim().toLowerCase();
  const style = `${competition?.style_name || ''}`.trim().toLowerCase();
  const numDancers = Number(competition?.num_dancers) || 0;
  return (!filters.category || category === filters.category)
    && (!filters.style || style === filters.style)
    && (!filters.withoutParticipants || numDancers === 0);
}

function getFilteredCompetitions() {
  const filters = getCurrentCompetitionFilters();
  return (Array.isArray(competitions) ? competitions : []).filter((competition) => competitionMatchesFilters(competition, filters));
}

function getBulkDeleteCompetitionElements() {
  return {
    tableWrap: document.getElementById('bulkDeleteCompetitionsTableWrap'),
    tableBody: document.getElementById('bulkDeleteCompetitionsTableBody'),
    totalEl: document.getElementById('bulkDeleteCompetitionsTotal'),
    participantsTotalEl: document.getElementById('bulkDeleteCompetitionsParticipantsTotal'),
    emptyState: document.getElementById('bulkDeleteCompetitionsEmptyState'),
    summaryEl: document.getElementById('bulkDeleteCompetitionsSummary'),
    closeBtn: document.getElementById('bulkDeleteCompetitionsCloseBtn'),
    closeTopBtn: document.getElementById('bulkDeleteCompetitionsCloseTopBtn'),
    deleteBtn: document.getElementById('bulkDeleteCompetitionsDeleteBtn')
  };
}

function updateBulkDeleteCompetitionsButtonState(visibleCount = getFilteredCompetitions().length) {
  const button = document.getElementById('openBulkDeleteCompetitionsBtn');
  if (!button) return;
  button.disabled = bulkDeleteCompetitionsState.isProcessing || visibleCount === 0 || getEvent()?.status === 'finished';
}

function buildBulkDeleteCompetitionStatusContent(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'small';

  if (item.status === 'processing') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm text-danger me-2';
    spinner.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(spinner);

    const text = document.createElement('span');
    text.textContent = t('bulk_delete_competitions_deleting', 'Deleting...');
    wrapper.appendChild(text);
    return wrapper;
  }

  if (item.status === 'ok') {
    const badge = document.createElement('span');
    badge.className = 'badge text-bg-success';
    badge.textContent = 'OK';
    wrapper.appendChild(badge);
    return wrapper;
  }

  if (item.status === 'error') {
    const badge = document.createElement('span');
    badge.className = 'badge text-bg-danger';
    badge.textContent = 'KO';
    wrapper.appendChild(badge);

    if (item.message) {
      const message = document.createElement('div');
      message.className = 'text-danger mt-1';
      message.textContent = item.message;
      wrapper.appendChild(message);
    }
    return wrapper;
  }

  wrapper.className = 'small text-muted';
  wrapper.textContent = '-';
  return wrapper;
}

function updateBulkDeleteCompetitionsSummary() {
  const { summaryEl } = getBulkDeleteCompetitionElements();
  if (!summaryEl) return;

  const totalCount = bulkDeleteCompetitionsState.items.length;
  const okCount = bulkDeleteCompetitionsState.items.filter((item) => item.status === 'ok').length;
  const errorCount = bulkDeleteCompetitionsState.items.filter((item) => item.status === 'error').length;

  summaryEl.textContent = t('bulk_delete_competitions_summary', 'Total: {total} | OK: {ok} | KO: {ko}')
    .replace('{total}', totalCount)
    .replace('{ok}', okCount)
    .replace('{ko}', errorCount);
}

function updateBulkDeleteCompetitionsControls() {
  const { closeBtn, closeTopBtn, deleteBtn } = getBulkDeleteCompetitionElements();
  const hasItems = bulkDeleteCompetitionsState.items.length > 0;

  if (closeBtn) {
    closeBtn.disabled = bulkDeleteCompetitionsState.isProcessing;
  }
  if (closeTopBtn) {
    closeTopBtn.disabled = bulkDeleteCompetitionsState.isProcessing;
  }
  if (deleteBtn) {
    deleteBtn.disabled = bulkDeleteCompetitionsState.isProcessing || !hasItems || bulkDeleteCompetitionsState.hasExecuted;
    deleteBtn.textContent = bulkDeleteCompetitionsState.isProcessing
      ? t('bulk_delete_competitions_deleting', 'Deleting...')
      : t('delete', 'Delete');
  }
}

function renderBulkDeleteCompetitionsList() {
  const { tableWrap, tableBody, totalEl, participantsTotalEl, emptyState } = getBulkDeleteCompetitionElements();
  if (!tableBody || !totalEl || !participantsTotalEl || !emptyState) return;

  tableBody.innerHTML = '';

  const participantsTotal = bulkDeleteCompetitionsState.items.reduce((sum, item) => {
    return sum + (Number(item.competition?.num_dancers) || 0);
  }, 0);

  totalEl.textContent = `${bulkDeleteCompetitionsState.items.length}`;
  participantsTotalEl.textContent = `${participantsTotal}`;

  bulkDeleteCompetitionsState.items.forEach((item) => {
    const row = document.createElement('tr');
    row.dataset.competitionId = item.competitionId;

    const categoryCell = document.createElement('td');
    categoryCell.className = 'align-middle';
    categoryCell.textContent = item.competition?.category_name || '-';

    const styleCell = document.createElement('td');
    styleCell.className = 'align-middle';
    styleCell.textContent = item.competition?.style_name || '-';

    const dancersCell = document.createElement('td');
    dancersCell.className = 'align-middle';
    dancersCell.textContent = `${Number(item.competition?.num_dancers) || 0}`;

    const statusCell = document.createElement('td');
    statusCell.className = 'align-middle bulk-delete-status-cell';
    statusCell.dataset.role = 'status';
    statusCell.appendChild(buildBulkDeleteCompetitionStatusContent(item));

    row.appendChild(categoryCell);
    row.appendChild(styleCell);
    row.appendChild(dancersCell);
    row.appendChild(statusCell);
    tableBody.appendChild(row);
  });

  if (tableWrap) {
    tableWrap.classList.toggle('d-none', bulkDeleteCompetitionsState.items.length === 0);
  }
  emptyState.classList.toggle('d-none', bulkDeleteCompetitionsState.items.length > 0);
  updateBulkDeleteCompetitionsSummary();
  updateBulkDeleteCompetitionsControls();
}

function setBulkDeleteCompetitionItemStatus(competitionId, status, message = '') {
  const item = bulkDeleteCompetitionsState.items.find((entry) => entry.competitionId === String(competitionId));
  if (!item) return;

  item.status = status;
  item.message = message;

  const { tableBody } = getBulkDeleteCompetitionElements();
  const row = tableBody
    ? Array.from(tableBody.querySelectorAll('tr')).find((candidate) => candidate.dataset.competitionId === String(competitionId))
    : null;
  const statusCell = row?.querySelector('[data-role="status"]');
  if (statusCell) {
    statusCell.replaceChildren(buildBulkDeleteCompetitionStatusContent(item));
  }

  updateBulkDeleteCompetitionsSummary();
}

function resetBulkDeleteCompetitionsState() {
  bulkDeleteCompetitionsState.items = [];
  bulkDeleteCompetitionsState.isProcessing = false;
  bulkDeleteCompetitionsState.hasExecuted = false;
  bulkDeleteCompetitionsState.deletedCount = 0;
  bulkDeleteCompetitionsState.pendingReload = false;
  renderBulkDeleteCompetitionsList();
  updateBulkDeleteCompetitionsButtonState();
}

function openBulkDeleteCompetitionsModal() {
  if (!bulkDeleteCompetitionsState.modal) return;

  bulkDeleteCompetitionsState.items = getFilteredCompetitions().map((competition) => ({
    competitionId: String(competition.id),
    competition,
    status: 'pending',
    message: ''
  }));
  bulkDeleteCompetitionsState.isProcessing = false;
  bulkDeleteCompetitionsState.hasExecuted = false;
  bulkDeleteCompetitionsState.deletedCount = 0;
  bulkDeleteCompetitionsState.pendingReload = false;

  renderBulkDeleteCompetitionsList();
  bulkDeleteCompetitionsState.modal.show();
}

function resetCompetitionModalElement(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('show');
  modalEl.style.display = 'none';
  modalEl.setAttribute('aria-hidden', 'true');
  modalEl.removeAttribute('aria-modal');
  modalEl.removeAttribute('role');
}

function cleanupCompetitionModalArtifacts({ forceFullCleanup = false } = {}) {
  const deleteModalEl = document.getElementById('deleteModal');
  const bulkDeleteModalEl = document.getElementById('bulkDeleteCompetitionsModal');
  if (deleteModalEl) {
    deleteModalEl.classList.remove('bulk-delete-confirm-modal');
  }

  document.querySelectorAll('.modal-backdrop.bulk-delete-confirm-backdrop').forEach((backdrop) => {
    backdrop.classList.remove('bulk-delete-confirm-backdrop');
  });

  const otherVisibleModals = Array.from(document.querySelectorAll('.modal.show')).filter((modalEl) => {
    return modalEl.id !== 'deleteModal';
  });

  if (forceFullCleanup || otherVisibleModals.length === 0) {
    const deleteModalInstance = deleteModalEl ? bootstrap.Modal.getInstance(deleteModalEl) : null;
    const bulkDeleteModalInstance = bulkDeleteModalEl ? bootstrap.Modal.getInstance(bulkDeleteModalEl) : null;

    deleteModalInstance?.dispose();
    bulkDeleteModalInstance?.dispose();

    resetCompetitionModalElement(deleteModalEl);
    resetCompetitionModalElement(bulkDeleteModalEl);

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.remove();
    });
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');

    if (bulkDeleteModalEl) {
      bulkDeleteCompetitionsState.modal = new bootstrap.Modal(bulkDeleteModalEl);
    }
  }
}

function showCompetitionDeleteConfirmationModal(message, { stacked = false, parentModalEl = null } = {}) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('deleteModal');
    const messageEl = document.getElementById('deleteModalMessage');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (!modalEl || !messageEl || !confirmBtn) {
      resolve(false);
      return;
    }

    if (!stacked) {
      cleanupCompetitionModalArtifacts({ forceFullCleanup: true });
    }

    const deleteModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let confirmed = false;
    const stackedModalClass = 'bulk-delete-confirm-modal';
    const stackedBackdropClass = 'bulk-delete-confirm-backdrop';

    messageEl.innerHTML = message;
    confirmBtn.onclick = () => {
      confirmed = true;
      deleteModal.hide();
    };

    if (stacked) {
      modalEl.classList.add(stackedModalClass);
    }

    modalEl.addEventListener('shown.bs.modal', () => {
      if (!stacked) return;
      const backdrops = document.querySelectorAll('.modal-backdrop');
      const latestBackdrop = backdrops[backdrops.length - 1];
      latestBackdrop?.classList.add(stackedBackdropClass);
    }, { once: true });

    modalEl.addEventListener('hidden.bs.modal', () => {
      confirmBtn.onclick = null;
      const parentModalStillOpen = Boolean(stacked && parentModalEl?.classList.contains('show'));
      if (stacked) {
        modalEl.classList.remove(stackedModalClass);
        document.querySelectorAll(`.modal-backdrop.${stackedBackdropClass}`).forEach((backdrop) => {
          backdrop.classList.remove(stackedBackdropClass);
        });
        if (parentModalStillOpen) {
          document.body.classList.add('modal-open');
        }
      }
      cleanupCompetitionModalArtifacts({ forceFullCleanup: !parentModalStillOpen });
      resolve(confirmed);
    }, { once: true });

    deleteModal.show();
  });
}

async function confirmAndRunBulkDeleteCompetitions() {
  if (!bulkDeleteCompetitionsState.modal || bulkDeleteCompetitionsState.isProcessing || bulkDeleteCompetitionsState.hasExecuted || !bulkDeleteCompetitionsState.items.length) {
    return;
  }

  const confirmMessage = t(
    'bulk_delete_competitions_confirm',
    'Are you sure you want to delete the {count} displayed competitions?'
  ).replace('{count}', `<strong>${bulkDeleteCompetitionsState.items.length}</strong>`);

  const confirmed = await showCompetitionDeleteConfirmationModal(confirmMessage, {
    stacked: true,
    parentModalEl: document.getElementById('bulkDeleteCompetitionsModal')
  });
  if (!confirmed) return;

  bulkDeleteCompetitionsState.isProcessing = true;
  updateBulkDeleteCompetitionsControls();

  let deletedCount = 0;

  for (const item of bulkDeleteCompetitionsState.items) {
    setBulkDeleteCompetitionItemStatus(item.competitionId, 'processing');
    const result = await deleteCompetition(item.competitionId, { showErrorModal: false });

    if (result.ok) {
      deletedCount += 1;
      setBulkDeleteCompetitionItemStatus(item.competitionId, 'ok');
    } else {
      setBulkDeleteCompetitionItemStatus(
        item.competitionId,
        'error',
        result.error || t('bulk_delete_competitions_delete_error', 'Error deleting competition.')
      );
    }
  }

  bulkDeleteCompetitionsState.deletedCount = deletedCount;
  bulkDeleteCompetitionsState.pendingReload = deletedCount > 0;
  bulkDeleteCompetitionsState.isProcessing = false;
  bulkDeleteCompetitionsState.hasExecuted = true;
  updateBulkDeleteCompetitionsControls();
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;

  await WaitEventLoaded();
  updateElementProperty('scheduleconfigUrl', 'href', `scheduleconfig.html?eventId=${eventId}`);

  const closedPanel = document.getElementById('closedPanel');

  if (getEvent().status == 'finished') {
      closedPanel.style.display = 'block';

      // deshabilitar inputs y botones
      document.querySelectorAll('input, button').forEach(el => {
        if (el.closest('#organizationSidebarToggle')) return;
        el.disabled = true;
      });
  }

  setupHeadJudgeFieldVisibility();
  setupReserveJudgeFieldVisibility();
  updateSubstituteJudgeHeadNoticeVisibility();
  updateTopActionButtonsVisibility();

  const categoryFilter = document.getElementById('categoryFilter');
  const styleFilter = document.getElementById('styleFilter');
  const emptyParticipantsFilter = document.getElementById('emptyParticipantsFilter');

  if (categoryFilter) {
    categoryFilter.addEventListener('change', applyCategoryFilter);
  }
  if (styleFilter) {
    styleFilter.addEventListener('change', applyCategoryFilter);
  }
  if (emptyParticipantsFilter) {
    emptyParticipantsFilter.addEventListener('change', applyCategoryFilter);
  }

  loadCategories();
  loadStyles();
  loadMasters();
  fetchCompetitionsFromAPI();

  const editForm = document.getElementById("editForm");

  if (editForm) {
    editForm.addEventListener("submit", (e) => {
      e.preventDefault(); // evita recarga/redirecciÃ³n
    });
  }

});

async function fetchCompetitionsFromAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching dancers');
    competitions = await response.json();
    loadCompetitions();
  } catch (error) {
    console.error('Failed to fetch dancers:', error);
  }
}

function isJudgeFlagEnabled(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function shouldShowHeadJudgeField() {
  const rawHasPenalties = getEvent()?.has_penalties;
  if (rawHasPenalties === true || rawHasPenalties === 1) return true;
  if (typeof rawHasPenalties === 'string') {
    const normalized = rawHasPenalties.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function shouldShowReserveJudgeField() {
  return Boolean(getEvent()?.hasMasters);
}

function shouldShowCriteriaPerJudgeButton() {
  const rawCriteriaPerJudge = getEvent()?.criteriaPerJudge;
  if (rawCriteriaPerJudge === true || rawCriteriaPerJudge === 1) return true;
  if (typeof rawCriteriaPerJudge === 'string') {
    const normalized = rawCriteriaPerJudge.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function updateTopActionButtonsVisibility() {
  const actionsRow = document.getElementById('competitionsActionsRow');
  const criteriaPerJudgeCol = document.getElementById('criteriaPerJudgeAssignmentCol');
  const substituteJudgeCol = document.getElementById('substituteJudgeCol');
  const criteriaColumnHeader = document.getElementById('criteriaColumnHeader');
  if (!actionsRow || !criteriaPerJudgeCol || !substituteJudgeCol) return;

  const showCriteriaPerJudgeButton = shouldShowCriteriaPerJudgeButton();
  criteriaPerJudgeCol.classList.toggle('d-none', !showCriteriaPerJudgeButton);
  substituteJudgeCol.classList.toggle('d-none', !showCriteriaPerJudgeButton);
  if (criteriaColumnHeader) {
    criteriaColumnHeader.classList.toggle('d-none', !showCriteriaPerJudgeButton);
  }
  actionsRow.classList.toggle('row-cols-lg-6', showCriteriaPerJudgeButton);
  actionsRow.classList.toggle('row-cols-lg-4', !showCriteriaPerJudgeButton);
  actionsRow.classList.remove('row-cols-lg-5');
}

function setupHeadJudgeFieldVisibility() {
  const section = document.getElementById('editJudgeHeadSection');
  if (!section) return;

  const showHeadJudge = shouldShowHeadJudgeField();
  section.classList.toggle('d-none', !showHeadJudge);

  if (!showHeadJudge) {
    const headSelect = document.getElementById('editJudgeHead');
    if (headSelect) {
      headSelect.value = '';
    }
  }
}

function setupReserveJudgeFieldVisibility() {
  const section = document.getElementById('editJudgeReserveSection');
  const reserveSelect = document.getElementById('editJudgeReserve');
  if (!section) return;

  const showReserveJudge = shouldShowReserveJudgeField();
  section.classList.toggle('d-none', !showReserveJudge);

  if (!showReserveJudge && reserveSelect) {
    reserveSelect.value = '';
  }
}

function updateSubstituteJudgeHeadNoticeVisibility() {
  const noticeWrapper = document.getElementById('substituteJudgeHeadNoticeWrapper');
  if (!noticeWrapper) return;

  noticeWrapper.classList.toggle('d-none', !Boolean(getEvent()?.has_penalties));
}

function updateEditCompetitionStatusBadge(status) {
  const statusBadge = document.getElementById('modalStatusBadge');
  if (!statusBadge) return;

  statusBadge.className = `badge bg-${statusColor[status] || 'secondary'} ms-2 align-middle`;
  statusBadge.textContent = convertStatus[status] || status || '';
}

function loadCompetitions() {
  const competitionsTable = document.getElementById('competitionsTable');
  competitionsTable.innerHTML = ''; // Limpiar tabla
  const showCriteriaPerJudgeUi = shouldShowCriteriaPerJudgeButton();

  competitions.forEach(comp => {
    const row = document.createElement('tr');
    row.dataset.id = comp.id;
    row.dataset.cat_id = comp.category_id;
    row.dataset.style_id = comp.style_id;
    row.dataset.num_dancers = Number(comp.num_dancers) || 0;
    const maxTimeSeconds = getCompetitionMaxTimeSeconds(comp);
    const maxTimeDisplay = maxTimeSecondsToNormalized(maxTimeSeconds) || t('not_defined', 'Not defined');

    let colorBg = statusColor[comp.status];
    let statusText = convertStatus[comp.status];
    let colorJudges;

    let tooltipText = `
      Total assigned: ${comp.judges.length}<br>
    `.trim();
    const isFinished = comp.status === 'FIN';
    const isOpen = comp.status === 'OPE' || comp.status === 'PRO';
    const isClosed = comp.status === 'CLO';
    const parsedHasCriteria = Number(comp.has_criteria);
    const hasCriteriaConfigured = Number.isFinite(parsedHasCriteria)
      ? parsedHasCriteria > 0
      : Boolean(comp.has_criteria);

    let btnDisabled = '';
    if (getEvent().status === 'finished') {
      btnDisabled = 'disabled';
    }

    // BotÃ³n de estado
    let statusBtn;
    if (isFinished) {
      statusBtn = `
        <button type="button" 
                class="btn btn-outline-secondary btn-sm" 
                disabled
                title="Finished" ${btnDisabled}>
            <i class="bi bi-check-circle"></i>
        </button>
      `;
    } else {
      statusBtn = `
        <button type="button" 
                class="btn btn-outline-${isOpen ? 'warning' : 'success'} btn-sm btn-toggle-status"
                title="${isOpen ? t('close_competition') : t('open_competition')}"
                data-action="${isOpen ? 'close' : 'open'}" ${btnDisabled}>
            <i class="bi ${isOpen ? 'bi-lock' : 'bi-unlock'}"></i>
        </button>
      `;
    }

    const criteriaCellIcon = hasCriteriaConfigured
      ? `<i class="bi bi-patch-check-fill text-success" title="${t('criteria_status_configured', 'Criteria configured')}"></i>`
      : `<i class="bi bi-exclamation-triangle-fill text-warning" title="${t('criteria_status_missing', 'No criteria configured')}"></i>`;
    const criteriaCell = `
      <td data-col-criteria class="${showCriteriaPerJudgeUi ? '' : 'd-none'} text-center align-middle">
        ${criteriaCellIcon}
      </td>
    `;
    const viewCriteriaActionBtn = showCriteriaPerJudgeUi
      ? `
            <button type="button" class="btn btn-outline-info btn-sm btn-view-criteria-config" title="${t('criteria_view_action', 'View configured criteria')}" ${btnDisabled}>
                <i class="bi bi-ui-checks-grid"></i>
            </button>
      `
      : '';

    row.innerHTML = `
      <td><span class="badge bg-secondary">${comp.category_name}</span></td>
      <td><span class="badge bg-secondary">${comp.style_name}</span></td>
      <td><i class="bi bi-clock me-1 text-muted"></i>${comp.estimated_start_form ?? 'Not defined'}</td>
      <td><i class="bi bi-stopwatch me-1 text-muted"></i>${maxTimeDisplay}</td>
      <td data-status><span class="badge bg-${colorBg}">${statusText}</span></td>
      <td>
        <i class="bi bi-people me-1 text-muted"></i>
        ${comp.judges
          .map(j => {
            const badges = [];
            if (isJudgeFlagEnabled(j.reserve)) {
              badges.push(`<span class="badge bg-secondary ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_in_reserve')}">R</span>`);
            }
            if (isJudgeFlagEnabled(j.head)) {
              badges.push(`<span class="badge bg-dark ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_is_head')}">H</span>`);
            }
            return badges.length ? `${j.name} ${badges.join(' ')}` : j.name;
          })
          .join(', ')
        }
      </td>
      ${criteriaCell}
      <td class="text-center">
        <span class="badge bg-secondary">${comp.num_dancers}</span>
      </td>
      <td class="text-center">
        <div class="btn-group" role="group">
            ${statusBtn}
            ${viewCriteriaActionBtn}
            <button type="button" class="btn btn-outline-secondary btn-sm btn-dancers-order" title="${t('dancers_order_modal_title')}" data-bs-toggle="modal" data-bs-target="#dancersOrderModal" ${btnDisabled}>
                <i class="bi bi-list-ol"></i>
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm btn-edit-competition" title="${t('edit')}" ${btnDisabled}>
                <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-delete-competition" title="${t('delete')}" ${btnDisabled}>
                <i class="bi bi-trash"></i>
            </button>
        </div>
      </td>
    `;

    competitionsTable.appendChild(row);
  });

  applyCategoryFilter();

  // Activar tooltips de Bootstrap despuÃ©s de crear los elementos
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

  competitionsTable.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async e => {
      const row = e.target.closest('tr');
      const compId = row.dataset.id;
      const action = btn.dataset.action; // ahora usamos data-action

      if (!action) return; // botÃ³n disabled (finished), no hacemos nada

      try {
        const response = await fetch(`${API_BASE_URL}/api/competitions/${compId}/changestatus`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: getEvent().id, action })
        });

        const data = await response.json();

        if (!response.ok) {
          showMessageModal(data.error || 'Error saving competition', 'Error');
          return;
        }

        // Recargamos la lista para reflejar el cambio de estado
        //await fetchCompetitionsFromAPI();
        let newStatus;
        if (action === 'open') {
          newStatus = 'OPE';
        } else if (action === 'close') {
          newStatus = 'CLO';
        }

        // Actualizamos la competiciÃ³n en el array local
        const compIndex = competitions.findIndex(c => c.id == compId);
        if (compIndex !== -1) {
          competitions[compIndex].status = newStatus;
        }

        const statusTd = row.querySelector('td[data-status]');
        const badge = statusTd.querySelector('.badge');
        if (badge) {
          badge.textContent = convertStatus[newStatus];
          badge.classList.remove('bg-success', 'bg-danger');
          badge.classList.add(newStatus === 'OPE' ? 'bg-success' : 'bg-danger');
        }

        // Actualizamos el botÃ³n
        btn.dataset.action = newStatus === 'OPE' ? 'close' : 'open';
        btn.title = newStatus === 'OPE' ? t('close_competition') : t('open_competition');
        btn.querySelector('i').className = newStatus === 'OPE' ? 'bi bi-lock' : 'bi bi-unlock';


      } catch (error) {
        console.error('Error changing status:', error);
        showMessageModal('Unexpected error changing status', 'Error');
      }
    });
  });

}


async function createCompetitionRequest(categoryId, styleId) {
  const payload = {
    event_id: getEvent().id,
    category_id: categoryId,
    style_id: styleId
    //,
    //startTime: '',
    //status: 'CLO'
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data?.error || t('create_competitions_error_save', 'Error saving competition')
      };
    }

    return { ok: true, message: data?.message || t('create_competitions_result_ok', 'Created') };
  } catch (error) {
    console.error('Error creating competition:', error);
    return {
      ok: false,
      message: error?.message || t('create_competitions_result_error', 'Unexpected error')
    };
  }
}

function buildCreateCompetitionCombinationKey(categoryId, styleId) {
  return `${String(categoryId)}::${String(styleId)}`;
}

function normalizeCreateCompetitionBulkResult(result) {
  const normalizedStatus = String(result?.status || '').toUpperCase();
  const status = normalizedStatus === 'OK' || normalizedStatus === 'KO' || normalizedStatus === 'SKIP'
    ? normalizedStatus
    : 'KO';
  const ok = status === 'OK';

  return {
    categoryId: String(result?.category_id ?? ''),
    styleId: String(result?.style_id ?? ''),
    status,
    ok,
    textError: result?.text_error || null,
    message: status === 'OK'
      ? t('create_competitions_result_ok', 'Created')
      : (status === 'SKIP'
        ? result?.text_error || t('create_competitions_result_skip', 'Skipped')
        : result?.text_error || t('create_competitions_result_error', 'Error'))
  };
}

async function createCompetitionsBulkRequest(combinations, options = {}) {
  const onlyWithDancers = Boolean(options?.onlyWithDancers);
  const payload = {
    event_id: getEvent().id,
    onlyWithDancers,
    status: 'CLO',
    competitions: combinations.map((combo) => ({
      category_id: combo.categoryId,
      style_id: combo.styleId
    }))
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data?.error || t('create_competitions_error_save', 'Error saving competition'),
        results: []
      };
    }

    const normalizedResults = Array.isArray(data)
      ? data.map(normalizeCreateCompetitionBulkResult)
      : [];
    const resultsByKey = new Map(
      normalizedResults.map((result) => [
        buildCreateCompetitionCombinationKey(result.categoryId, result.styleId),
        result
      ])
    );

    const orderedResults = combinations.map((combo) => {
      const normalizedResult = resultsByKey.get(
        buildCreateCompetitionCombinationKey(combo.categoryId, combo.styleId)
      );

      if (!normalizedResult) {
        return {
          categoryId: combo.categoryId,
          styleId: combo.styleId,
          status: 'KO',
          ok: false,
          message: t('create_competitions_result_error', 'Error')
        };
      }

      return {
        ...normalizedResult,
        categoryId: combo.categoryId,
        styleId: combo.styleId
      };
    });

    return {
      ok: true,
      results: orderedResults,
      successCount: orderedResults.filter((result) => result.status === 'OK').length,
      skippedCount: orderedResults.filter((result) => result.status === 'SKIP').length,
      failedResults: orderedResults.filter((result) => result.status === 'KO')
    };
  } catch (error) {
    console.error('Error creating competitions in bulk:', error);
    return {
      ok: false,
      message: error?.message || t('create_competitions_result_error', 'Unexpected error'),
      results: []
    };
  }
}


async function addCompt() {
  
  const inputCat = document.getElementById('categoryDropdown');
  const inputSty = document.getElementById('styleDropdown');
  const valueCat = inputCat.value.trim();
  const valueSty = inputSty.value.trim();

  if (valueCat !== "" && valueSty !== "") {

    // Deshabilitar botÃ³n para evitar mÃºltiples envÃ­os
    const addBtn = document.getElementById('createBtn');
    if (addBtn.disabled) return;
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";

    try {
      const createResult = await createCompetitionRequest(valueCat, valueSty);

      if (!createResult.ok) {
        inputCat.value = '';
        inputSty.value = '';
        showMessageModal(createResult.message, t('error_title', 'Error'));
        return;
      }

      // Vuelves a cargar la lista desde la API
      await fetchCompetitionsFromAPI();

      // Limpias los inputs
      inputCat.value = '';
      inputSty.value = '';

    } catch (error) {
      console.error(error);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add Competition";
    }
  } else {
    showMessageModal(t('error_create_competition'), 'Error');
  }
}

function toDatetimeLocalFormat(str) {
  if (!str) return ''; // evitar errores con null o undefined

  const [datePart, timePart] = str.split(" ");
  if (!datePart || !timePart) return '';

  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (
    !day || !month || !year ||
    hour === undefined || minute === undefined
  ) return '';

  return `${year.toString().padStart(4, '0')}-` +
         `${month.toString().padStart(2, '0')}-` +
         `${day.toString().padStart(2, '0')}T` +
         `${hour.toString().padStart(2, '0')}:` +
         `${minute.toString().padStart(2, '0')}`;
}

async function saveCompetitionEdits(editModal) {
  const editForm = document.getElementById('editForm');
  const competitionId = editForm.dataset.id;
  const categoryId = editForm.dataset.cat_id;
  const styleId = editForm.dataset.style_id;

  const inputEstimatedStart = document.getElementById('editStartTime');
  const inputStatus = document.getElementById('editStatus');
  const inputJudges = Array.from(document.getElementById('editJudges').selectedOptions).map(opt => opt.value);
  const inputReserveJudge = document.getElementById('editJudgeReserve');
  const inputHeadJudge = document.getElementById('editJudgeHead');
  const inputMaxTime = document.getElementById('editMaxTime');
  const maxTimeRaw = (inputMaxTime?.value || '').trim();

  let maxTimeSeconds = null;
  if (maxTimeRaw) {
    const normalizedMaxTime = normalizeMaxTimeValue(maxTimeRaw);
    const parsedMaxTimeSeconds = maxTimeToSeconds(normalizedMaxTime);

    if (!normalizedMaxTime || !Number.isFinite(parsedMaxTimeSeconds)) {
      if (inputMaxTime) inputMaxTime.classList.add('is-invalid');
      showMessageModal(
        t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
        t('error_title', 'Error')
      );
      return;
    }

    if (inputMaxTime) {
      inputMaxTime.classList.remove('is-invalid');
      inputMaxTime.value = normalizedMaxTime;
    }
    maxTimeSeconds = parsedMaxTimeSeconds;
  } else if (inputMaxTime) {
    inputMaxTime.classList.remove('is-invalid');
  }

  const competitionData = {
    category_id: categoryId,
    style_id: styleId,
    estimated_start: inputEstimatedStart.value,
    status: inputStatus.value,
    judges: inputJudges,
    judge_reserve: shouldShowReserveJudgeField() && inputReserveJudge ? (inputReserveJudge.value || null) : null,
    max_time: maxTimeSeconds,
    event_id: getEvent().id
  };

  if (shouldShowHeadJudgeField()) {
    competitionData.judge_head = inputHeadJudge ? (inputHeadJudge.value || null) : null;
  }

  const response = await fetch(`${API_BASE_URL}/api/competitions/${competitionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(competitionData)
  });

  if (!response.ok) {
    const errData = await response.json();
    showMessageModal(errData.error || 'Error saving competition', 'Error');
    return;
  }

  await fetchCompetitionsFromAPI();
  editModal.hide();
}


document.addEventListener('DOMContentLoaded', async () => {
    await ensureTranslationsReady();
    const editModal = new bootstrap.Modal(document.getElementById('editModal'));
    const bulkDeleteCompetitionsModalEl = document.getElementById('bulkDeleteCompetitionsModal');
    const openBulkDeleteCompetitionsBtn = document.getElementById('openBulkDeleteCompetitionsBtn');
    const bulkDeleteCompetitionsDeleteBtn = document.getElementById('bulkDeleteCompetitionsDeleteBtn');
    const bulkDeleteCompetitionsCloseTopBtn = document.getElementById('bulkDeleteCompetitionsCloseTopBtn');
    const scheduleConfigWarningModalEl = document.getElementById('scheduleConfigWarningModal');
    const scheduleConfigWarningModal = scheduleConfigWarningModalEl ? new bootstrap.Modal(scheduleConfigWarningModalEl) : null;
    const dancersOrderModal = new bootstrap.Modal(document.getElementById('dancersOrderModal'));
    const judgesAssignmentModalEl = document.getElementById('judgesAssignmentModal');
    const judgesAssignmentModal = judgesAssignmentModalEl ? new bootstrap.Modal(judgesAssignmentModalEl) : null;
    const substituteJudgeModalEl = document.getElementById('substituteJudgeModal');
    const substituteJudgeModal = substituteJudgeModalEl ? new bootstrap.Modal(substituteJudgeModalEl) : null;
    const criteriaPerJudgeAssignmentModalEl = document.getElementById('criteriaPerJudgeAssignmentModal');
    const criteriaPerJudgeAssignmentModal = criteriaPerJudgeAssignmentModalEl ? new bootstrap.Modal(criteriaPerJudgeAssignmentModalEl) : null;
    const competitionCriteriaConfigModalEl = document.getElementById('competitionCriteriaConfigModal');
    const competitionCriteriaConfigModal = competitionCriteriaConfigModalEl ? new bootstrap.Modal(competitionCriteriaConfigModalEl) : null;
    const maxTimesModalEl = document.getElementById('maxTimesModal');
    const maxTimesModal = maxTimesModalEl ? new bootstrap.Modal(maxTimesModalEl) : null;
    const createCompetitionsModalEl = document.getElementById('createCompetitionsModal');
    const createCompetitionsModal = createCompetitionsModalEl ? new bootstrap.Modal(createCompetitionsModalEl) : null;
    const editMaxTimeInput = document.getElementById('editMaxTime');
    const scheduleConfigWarningMessageEl = document.getElementById('scheduleConfigWarningMessage');

    if (bulkDeleteCompetitionsCloseTopBtn) {
      bulkDeleteCompetitionsCloseTopBtn.setAttribute('aria-label', t('close', 'Close'));
    }

    if (bulkDeleteCompetitionsModalEl) {
      bulkDeleteCompetitionsState.modal = new bootstrap.Modal(bulkDeleteCompetitionsModalEl);
      bulkDeleteCompetitionsModalEl.addEventListener('hidden.bs.modal', async () => {
        const shouldReload = bulkDeleteCompetitionsState.pendingReload;
        cleanupCompetitionModalArtifacts({ forceFullCleanup: true });
        resetBulkDeleteCompetitionsState();

        if (shouldReload) {
          await fetchCompetitionsFromAPI();
        }
      });
    }

    if (openBulkDeleteCompetitionsBtn) {
      openBulkDeleteCompetitionsBtn.addEventListener('click', () => {
        openBulkDeleteCompetitionsModal();
      });
    }

    if (bulkDeleteCompetitionsDeleteBtn) {
      bulkDeleteCompetitionsDeleteBtn.addEventListener('click', async () => {
        await confirmAndRunBulkDeleteCompetitions();
      });
    }

    document.addEventListener('click', async (event) => {

      const button = event.target.closest('.btn-edit-competition');

      if (button) {

        const tr = button.closest('tr');

        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        const editForm = document.getElementById('editForm');
        editForm.dataset.id = button.closest('tr').dataset.id;
        editForm.dataset.cat_id = competition.category_id;
        editForm.dataset.style_id = competition.style_id;

        document.getElementById('modalTitleCategory').textContent = competition.category_name;
        document.getElementById('modalTitleStyle').textContent = competition.style_name;
        const estimatedStartValue = toDatetimeLocalFormat(competition.estimated_start_form);
        document.getElementById('editStartTime').value = estimatedStartValue;
        document.getElementById('editStatus').value = competition.status;
        updateEditCompetitionStatusBadge(competition.status);
        const scheduleNotice = document.getElementById('scheduleConfigNotice');
        const hasScheduleConfig = competition.schedule_config !== null && competition.schedule_config !== undefined;
        editForm.dataset.schedule_config = hasScheduleConfig ? String(competition.schedule_config) : '';
        editForm.dataset.original_estimated_start = estimatedStartValue || '';
        if (scheduleNotice) {
          scheduleNotice.classList.toggle('d-none', !hasScheduleConfig);
        }

        const judges = competition.judges || [];

        const judgeOptions = document.getElementById('editJudges').options;
        const reserveSelect = document.getElementById('editJudgeReserve');
        const headSelect = document.getElementById('editJudgeHead');
        
        const judgeIds = judges.map(j => String(j.id)); // ids como strings para comparar

        Array.from(judgeOptions).forEach(opt => {
          opt.selected = judgeIds.includes(opt.value);
        });

        if (reserveSelect && shouldShowReserveJudgeField()) {
          const reserveJudge = judges.find(j => isJudgeFlagEnabled(j.reserve));
          reserveSelect.value = reserveJudge ? String(reserveJudge.id) : '';
        } else if (reserveSelect) {
          reserveSelect.value = '';
        }
        if (headSelect && shouldShowHeadJudgeField()) {
          const headJudge = judges.find(j => isJudgeFlagEnabled(j.head));
          headSelect.value = headJudge ? String(headJudge.id) : '';
        } else if (headSelect) {
          headSelect.value = '';
        }
        if (editMaxTimeInput) {
          const existingMaxTimeSeconds = getCompetitionMaxTimeSeconds(competition);
          const existingMaxTimeNormalized = maxTimeSecondsToNormalized(existingMaxTimeSeconds) || '';
          editMaxTimeInput.value = existingMaxTimeNormalized;
          editMaxTimeInput.classList.remove('is-invalid');
          editForm.dataset.original_max_time = existingMaxTimeNormalized;
        }

        editModal.show();
      } else if (event.target.closest('.btn-view-criteria-config')) {
        const button = event.target.closest('.btn-view-criteria-config');
        const tr = button?.closest('tr');
        const competitionId = tr?.dataset?.id;
        if (!competitionId || !competitionCriteriaConfigModal) return;
        openCompetitionCriteriaConfigModal(competitionId, competitionCriteriaConfigModal);
      } else if (event.target.closest('.btn-delete-competition')) {

        const button = event.target.closest('.btn-delete-competition');

        const tr = button.closest('tr');
        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        if (competition) {
          const message = `${t('confirm_delete_competition')} <strong>${competition.category_name} - ${competition.style_name}</strong>?`;
          const confirmed = await showCompetitionDeleteConfirmationModal(message);
          if (!confirmed) return;

          const result = await deleteCompetition(competitionId);
          if (result.ok) {
            await fetchCompetitionsFromAPI();
          }
        }
      }

    });

    document.getElementById('saveEditBtn').addEventListener('click', async () => {
      const editForm = document.getElementById('editForm');
      const hasScheduleConfig = Boolean(editForm.dataset.schedule_config);
      const originalStart = editForm.dataset.original_estimated_start || '';
      const currentStart = document.getElementById('editStartTime').value || '';
      const originalMaxTime = editForm.dataset.original_max_time || '';
      const maxTimeInput = document.getElementById('editMaxTime');
      const maxTimeRaw = (maxTimeInput?.value || '').trim();
      const currentMaxTime = maxTimeRaw ? normalizeMaxTimeValue(maxTimeRaw) : '';
      const maxTimeChanged = currentMaxTime !== null && currentMaxTime !== originalMaxTime;
      const startChanged = originalStart !== currentStart;

      if (hasScheduleConfig && (startChanged || maxTimeChanged) && scheduleConfigWarningModal) {
        if (scheduleConfigWarningMessageEl) {
          scheduleConfigWarningMessageEl.textContent = startChanged
            ? t('schedule_config_warning_message')
            : t('schedule_config_warning_max_time_message');
        }
        const confirmButton = document.getElementById('confirmScheduleConfigOverrideBtn');
        confirmButton.onclick = async () => {
          await saveCompetitionEdits(editModal);
          scheduleConfigWarningModal.hide();
        };
        scheduleConfigWarningModal.show();
        return;
      }

      await saveCompetitionEdits(editModal);
    });

    if (editMaxTimeInput) {
      editMaxTimeInput.addEventListener('input', () => {
        editMaxTimeInput.classList.remove('is-invalid');
      });
    }

    const sortable = new Sortable(document.getElementById('sortableDancers'), {
      animation: 150,
      onEnd: () => {
        document.querySelectorAll('#sortableDancers .order-number').forEach((el, i) => {
          el.textContent = `${i + 1}.`;
        });
      }
    });

    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('.btn-dancers-order');
      if (!btn) return;

      const compId = btn.closest('tr').dataset.id;

      const list = document.getElementById('sortableDancers');
      list.innerHTML = '';
      list.dataset.competitionId = compId;

      try {
        const res = await fetch(`${API_BASE_URL}/api/competitions/${compId}/dancers?event_id=${getEvent().id}`);
        if (!res.ok) throw new Error('Error fetching dancers');
        const dancers = await res.json();

        dancers.forEach(dancer => {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex align-items-center draggable-item';
          li.dataset.id = dancer.id;

          li.innerHTML = `
            <span class="me-3 text-muted drag-icon"><i class="bi bi-grip-vertical"></i></span>
            <span class="me-2 order-number">${dancer.position}.</span>
            ${getDancerFlagImgHtml(dancer.nationality, { className: 'me-2', style: 'width: 24px;' })}
            <span class="dancer-name">${dancer.dancer_name}</span>
          `;

          list.appendChild(li);
        });

        dancersOrderModal.show();
      } catch (err) {
        console.error('Error loading dancers:', err);
      }
    });

  
    document.getElementById('saveDancerOrder').addEventListener('click', () => {
      const items = document.querySelectorAll('#sortableDancers li');
      const dancerIds = Array.from(items).map(item => item.dataset.id, 10);
      const compId = document.getElementById('sortableDancers').dataset.competitionId;
    
      fetch(`${API_BASE_URL}/api/competitions/${compId}/order?event_id=${getEvent().id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competition_id: compId,
          order: dancerIds
        })
      })
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => {
        dancersOrderModal.hide();
      })
      .catch(err => console.error('Error al guardar orden:', err));

      // Cerrar modal
      dancersOrderModal.hide();
    });

    const judgesAssignmentBtn = document.getElementById('judgesAssignmentBtn');
    const substituteJudgeBtn = document.getElementById('substituteJudgeBtn');
    const criteriaPerJudgeAssignmentBtn = document.getElementById('criteriaPerJudgeAssignmentBtn');
    const assignJudgesBtn = document.getElementById('assignJudgesBtn');
    const fetchSubstituteJudgeDataBtn = document.getElementById('fetchSubstituteJudgeDataBtn');
    const performSubstituteJudgeBtn = document.getElementById('performSubstituteJudgeBtn');
    const assignCriteriaPerJudgeBtn = document.getElementById('assignCriteriaPerJudgeBtn');
    const saveCompetitionCriteriaConfigBtn = document.getElementById('saveCompetitionCriteriaConfigBtn');
    const deleteCompetitionCriteriaConfigBtn = document.getElementById('deleteCompetitionCriteriaConfigBtn');
    const substituteJudgeSourceSelect = document.getElementById('substituteJudgeSourceSelect');
    const substituteJudgeReplacementSelect = document.getElementById('substituteJudgeReplacementSelect');
    const substituteJudgeSelectAllCompetitions = document.getElementById('substituteJudgeSelectAllCompetitions');

    if (judgesAssignmentBtn && judgesAssignmentModal) {
      judgesAssignmentBtn.addEventListener('click', async () => {
        if (!masters.length) {
          await loadMasters();
        }

        if (!competitions.length) {
          await fetchCompetitionsFromAPI();
        }

        renderJudgesAssignmentList();
        renderCompetitionsAssignmentList();
        judgesAssignmentModal.show();
      });
    }

    if (assignJudgesBtn) {
      assignJudgesBtn.addEventListener('click', async () => {
        const selectedJudges = getSelectedAssignmentJudges();
        const selectedHeadJudge = getSelectedAssignmentHeadJudge();
        const selectedCompetitions = getSelectedAssignmentCompetitions();

        if (!selectedJudges.length) {
          showMessageModal(t('judges_assignment_missing_judges'), 'Error');
          return;
        }

        if (!selectedCompetitions.length) {
          showMessageModal(t('judges_assignment_missing_competitions'), 'Error');
          return;
        }

        assignJudgesBtn.disabled = true;
        const originalText = assignJudgesBtn.textContent;
        assignJudgesBtn.textContent = t('judges_assignment_status_updating');

        for (const compId of selectedCompetitions) {
          const competition = competitions.find(c => String(c.id) === String(compId));
          if (!competition) {
            setAssignmentResult(compId, 'error', 'Competition not found');
            continue;
          }

          await updateCompetitionJudgesAssignment(competition, selectedJudges, selectedHeadJudge);
        }

        assignJudgesBtn.disabled = false;
        assignJudgesBtn.textContent = originalText;
      });
    }

    if (judgesAssignmentModalEl) {
      judgesAssignmentModalEl.addEventListener('hidden.bs.modal', () => {
        window.location.reload();
      });
    }

    if (substituteJudgeBtn && substituteJudgeModal) {
      substituteJudgeBtn.addEventListener('click', async () => {
        if (!masters.length) {
          await loadMasters();
        }

        resetSubstituteJudgeState();
        populateSubstituteJudgeSelects();
        renderSubstituteJudgeCompetitionsList();
        updateSubstituteJudgeSelectAllState();
        updateSubstituteJudgeApplyButtonState();
        substituteJudgeModal.show();
      });
    }

    if (fetchSubstituteJudgeDataBtn) {
      fetchSubstituteJudgeDataBtn.addEventListener('click', async () => {
        const selectedJudgeId = String(substituteJudgeSourceSelect?.value || '').trim();
        if (!selectedJudgeId) {
          showMessageModal(
            t('substitute_judge_missing_source', 'Selecciona un juez.'),
            t('error_title', 'Error')
          );
          return;
        }

        substituteJudgeState.sourceJudgeId = selectedJudgeId;
        updateSubstituteJudgeReplacementOptions();
        await loadSubstituteJudgeCompetitions(selectedJudgeId, fetchSubstituteJudgeDataBtn);
      });
    }

    if (substituteJudgeSourceSelect) {
      substituteJudgeSourceSelect.addEventListener('change', () => {
        substituteJudgeState.sourceJudgeId = String(substituteJudgeSourceSelect.value || '').trim();
        substituteJudgeState.competitions = [];
        substituteJudgeState.selectedCompetitionIds.clear();
        updateSubstituteJudgeReplacementOptions();
        renderSubstituteJudgeCompetitionsList();
        updateSubstituteJudgeSelectAllState();
        updateSubstituteJudgeApplyButtonState();
      });
    }

    if (substituteJudgeReplacementSelect) {
      substituteJudgeReplacementSelect.addEventListener('change', () => {
        substituteJudgeState.replacementJudgeId = String(substituteJudgeReplacementSelect.value || '').trim();
        updateSubstituteJudgeApplyButtonState();
      });
    }

    if (substituteJudgeSelectAllCompetitions) {
      substituteJudgeSelectAllCompetitions.addEventListener('change', () => {
        const eligibleCompetitionIds = substituteJudgeState.competitions.map(comp => String(comp.id));
        substituteJudgeState.selectedCompetitionIds = substituteJudgeSelectAllCompetitions.checked
          ? new Set(eligibleCompetitionIds)
          : new Set();
        renderSubstituteJudgeCompetitionsList();
        updateSubstituteJudgeSelectAllState();
        updateSubstituteJudgeApplyButtonState();
      });
    }

    if (performSubstituteJudgeBtn) {
      performSubstituteJudgeBtn.addEventListener('click', async () => {
        await submitSubstituteJudgeReplacement(performSubstituteJudgeBtn);
      });
    }

    if (substituteJudgeModalEl) {
      substituteJudgeModalEl.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('substitute-judge-competition-checkbox')) return;

        const competitionId = String(target.dataset.competitionId || '').trim();
        if (!competitionId) return;

        if (target.checked) {
          substituteJudgeState.selectedCompetitionIds.add(competitionId);
        } else {
          substituteJudgeState.selectedCompetitionIds.delete(competitionId);
        }

        updateSubstituteJudgeSelectAllState();
        updateSubstituteJudgeApplyButtonState();
      });

      substituteJudgeModalEl.addEventListener('hidden.bs.modal', () => {
        resetSubstituteJudgeState();
        populateSubstituteJudgeSelects();
        renderSubstituteJudgeCompetitionsList();
        updateSubstituteJudgeSelectAllState();
        updateSubstituteJudgeApplyButtonState();
      });
    }

    if (criteriaPerJudgeAssignmentBtn && criteriaPerJudgeAssignmentModal) {
      criteriaPerJudgeAssignmentBtn.addEventListener('click', async () => {
        if (!competitions.length) {
          await fetchCompetitionsFromAPI();
        }

        criteriaPerJudgeState.hasPersistedChanges = false;
        prepareCriteriaPerJudgeAssignmentModal();
        criteriaPerJudgeAssignmentModal.show();
      });
    }

    if (criteriaPerJudgeAssignmentModalEl) {
      criteriaPerJudgeAssignmentModalEl.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.classList.contains('criteria-per-judge-group-select-all')) {
          handleCriteriaPerJudgeGroupSelectAllChange(target);
          return;
        }

        if (target.classList.contains('criteria-per-judge-comp-checkbox')) {
          handleCriteriaPerJudgeCompetitionSelectionChange(target);
          return;
        }

        if (target.classList.contains('criteria-per-judge-pair-select') && target.dataset.context === 'bulk') {
          handleCriteriaPerJudgePairSelectionChange(target, criteriaPerJudgeState);
        }
      });

      criteriaPerJudgeAssignmentModalEl.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement
          ? event.target.closest('.criteria-per-judge-pair-add-btn, .criteria-per-judge-pair-remove-btn')
          : null;
        if (!(target instanceof HTMLElement) || target.dataset.context !== 'bulk') return;

        if (target.classList.contains('criteria-per-judge-pair-add-btn')) {
          addCriteriaPerJudgePairAssignment(criteriaPerJudgeState);
          renderCriteriaPerJudgeMappingPanel();
          return;
        }

        if (target.classList.contains('criteria-per-judge-pair-remove-btn')) {
          removeCriteriaPerJudgePairAssignment(
            criteriaPerJudgeState,
            target.dataset.rowId,
            true
          );
          renderCriteriaPerJudgeMappingPanel();
        }
      });

      criteriaPerJudgeAssignmentModalEl.addEventListener('hidden.bs.modal', async () => {
        const shouldRefreshCompetitions = criteriaPerJudgeState.hasPersistedChanges;
        criteriaPerJudgeState.hasPersistedChanges = false;
        clearCriteriaPerJudgeSelections();
        renderCriteriaPerJudgeGroupsAccordion();
        renderCriteriaPerJudgeMappingPanel();

        if (shouldRefreshCompetitions) {
          await fetchCompetitionsFromAPI();
        }
      });
    }

    if (assignCriteriaPerJudgeBtn) {
      assignCriteriaPerJudgeBtn.addEventListener('click', () => {
        handleCriteriaPerJudgeAssignmentSubmit();
      });
    }

    if (competitionCriteriaConfigModalEl) {
      competitionCriteriaConfigModalEl.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('criteria-per-judge-pair-select') && target.dataset.context === 'competition') {
          handleCompetitionCriteriaPerJudgeSelectionChange(target);
        }
      });

      competitionCriteriaConfigModalEl.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement
          ? event.target.closest('.criteria-per-judge-pair-add-btn, .criteria-per-judge-pair-remove-btn')
          : null;
        if (!(target instanceof HTMLElement) || target.dataset.context !== 'competition') return;

        if (target.classList.contains('criteria-per-judge-pair-add-btn')) {
          addCriteriaPerJudgePairAssignment(criteriaPerJudgeCompetitionState);
          renderCompetitionCriteriaConfigMappingPanel();
          return;
        }

        if (target.classList.contains('criteria-per-judge-pair-remove-btn')) {
          removeCriteriaPerJudgePairAssignment(
            criteriaPerJudgeCompetitionState,
            target.dataset.rowId,
            criteriaPerJudgeCompetitionState.canEdit
          );
          renderCompetitionCriteriaConfigMappingPanel();
        }
      });

      competitionCriteriaConfigModalEl.addEventListener('hidden.bs.modal', () => {
        resetCompetitionCriteriaConfigState();
        renderCompetitionCriteriaConfigSummary();
        renderCompetitionCriteriaConfigMappingPanel();
      });
    }

    if (saveCompetitionCriteriaConfigBtn) {
      saveCompetitionCriteriaConfigBtn.addEventListener('click', () => {
        handleCompetitionCriteriaConfigSave();
      });
    }

    if (deleteCompetitionCriteriaConfigBtn) {
      deleteCompetitionCriteriaConfigBtn.addEventListener('click', () => {
        handleCompetitionCriteriaConfigDelete();
      });
    }

    const createCompetitionsBtn = document.getElementById('createCompetitionsBtn');
    const createCompsSelectAllCategories = document.getElementById('createCompsSelectAllCategories');
    const createCompsSelectAllStyles = document.getElementById('createCompsSelectAllStyles');
    const createCompsOnlyWithDancers = document.getElementById('createCompsOnlyWithDancers');
    const createCompetitionsApplyBtn = document.getElementById('createCompetitionsApplyBtn');

    if (createCompetitionsBtn && createCompetitionsModal) {
      createCompetitionsBtn.addEventListener('click', async () => {
        await ensureCreateCompsSourceOptionsLoaded();
        renderCreateCompetitionsSelectionLists();
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
        clearCreateCompsResultPanel();
        createCompetitionsModal.show();
      });
    }

    if (createCompsSelectAllCategories) {
      createCompsSelectAllCategories.addEventListener('change', () => {
        setCreateCompsOptionsChecked('category', createCompsSelectAllCategories.checked);
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompsSelectAllStyles) {
      createCompsSelectAllStyles.addEventListener('change', () => {
        setCreateCompsOptionsChecked('style', createCompsSelectAllStyles.checked);
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompetitionsModalEl) {
      createCompetitionsModalEl.addEventListener('change', (event) => {
        if (!event.target.classList.contains('create-comps-option')) return;
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompetitionsApplyBtn) {
      createCompetitionsApplyBtn.addEventListener('click', async () => {
        const selectedCategories = getSelectedCreateCompsValues('category');
        const selectedStyles = getSelectedCreateCompsValues('style');

        if (!selectedCategories.length) {
          showMessageModal(
            t('create_competitions_missing_categories', 'Select at least one category.'),
            t('error_title', 'Error')
          );
          return;
        }

        if (!selectedStyles.length) {
          showMessageModal(
            t('create_competitions_missing_styles', 'Select at least one style.'),
            t('error_title', 'Error')
          );
          return;
        }

        createCompetitionsApplyBtn.disabled = true;
        const originalText = createCompetitionsApplyBtn.textContent;
        createCompetitionsApplyBtn.textContent = t('create_competitions_creating', 'Creating...');
        try {
          const combinations = [];
          selectedCategories.forEach((categoryId) => {
            selectedStyles.forEach((styleId) => {
              combinations.push({
                categoryId,
                styleId,
                categoryName: getSelectOptionLabel('categoryDropdown', categoryId),
                styleName: getSelectOptionLabel('styleDropdown', styleId)
              });
            });
          });

          const onlyWithDancers = Boolean(createCompsOnlyWithDancers?.checked);
          const bulkResult = await createCompetitionsBulkRequest(combinations, { onlyWithDancers });
          if (!bulkResult.ok) {
            showMessageModal(
              bulkResult.message,
              t('error_title', 'Error')
            );
            return;
          }

          const results = combinations.map((combo, index) => {
            const result = bulkResult.results[index] || {};
            return {
              ...combo,
              status: result.status,
              ok: result.ok,
              textError: result.textError,
              message: result.message
            };
          });

          renderCreateCompsResults(results);
          await fetchCompetitionsFromAPI();
        } finally {
          createCompetitionsApplyBtn.disabled = false;
          createCompetitionsApplyBtn.textContent = originalText;
        }
      });
    }

    const maxTimesAssignmentBtn = document.getElementById('maxTimesAssignmentBtn');
    const maxTimesSelectAllCategories = document.getElementById('maxTimesSelectAllCategories');
    const maxTimesSelectAllStyles = document.getElementById('maxTimesSelectAllStyles');
    const assignMaxTimesBtn = document.getElementById('assignMaxTimesBtn');
    const maxTimesValueInput = document.getElementById('maxTimesValue');

    if (maxTimesAssignmentBtn && maxTimesModal) {
      maxTimesAssignmentBtn.addEventListener('click', async () => {
        await ensureCreateCompsSourceOptionsLoaded();
        renderMaxTimesSelectionLists();
        if (maxTimesValueInput) {
          maxTimesValueInput.value = '';
          maxTimesValueInput.classList.remove('is-invalid');
        }
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
        maxTimesModal.show();
      });
    }

    if (maxTimesSelectAllCategories) {
      maxTimesSelectAllCategories.addEventListener('change', () => {
        setMaxTimesOptionsChecked('category', maxTimesSelectAllCategories.checked);
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesSelectAllStyles) {
      maxTimesSelectAllStyles.addEventListener('change', () => {
        setMaxTimesOptionsChecked('style', maxTimesSelectAllStyles.checked);
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesModalEl) {
      maxTimesModalEl.addEventListener('change', (event) => {
        if (!event.target.classList.contains('max-times-option')) return;
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesValueInput) {
      maxTimesValueInput.addEventListener('input', () => {
        maxTimesValueInput.classList.remove('is-invalid');
      });
    }

    if (assignMaxTimesBtn) {
      assignMaxTimesBtn.addEventListener('click', async () => {
        const selectedCategories = getSelectedMaxTimesValues('category');
        const selectedStyles = getSelectedMaxTimesValues('style');
        const maxTimeRaw = (maxTimesValueInput?.value || '').trim();
        const normalizedMaxTime = normalizeMaxTimeValue(maxTimeRaw);
        const maxTimeSeconds = maxTimeToSeconds(normalizedMaxTime);

        if (!selectedCategories.length) {
          showMessageModal(
            t('max_times_missing_categories', 'Select at least one category.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!selectedStyles.length) {
          showMessageModal(
            t('max_times_missing_styles', 'Selecciona al menos un estilo.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!normalizedMaxTime) {
          if (maxTimesValueInput) maxTimesValueInput.classList.add('is-invalid');
          showMessageModal(
            t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!Number.isFinite(maxTimeSeconds)) {
          if (maxTimesValueInput) maxTimesValueInput.classList.add('is-invalid');
          showMessageModal(
            t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
            t('error_title', 'Error')
          );
          return;
        }

        if (maxTimesValueInput) {
          maxTimesValueInput.classList.remove('is-invalid');
          maxTimesValueInput.value = normalizedMaxTime;
        }

        const originalText = assignMaxTimesBtn.textContent;
        assignMaxTimesBtn.disabled = true;
        assignMaxTimesBtn.textContent = t('max_times_status_updating', 'Updating...');

        try {
          const response = await fetch(`${API_BASE_URL}/api/competitions/bulk-max-time`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id: getEvent().id,
              category_list: selectedCategories,
              styles_list: selectedStyles,
              max_time: maxTimeSeconds
            })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            showMessageModal(
              data?.error || t('max_times_request_error', 'Error assigning maximum times.'),
              t('error_title', 'Error')
            );
            return;
          }

          const successTemplate = t(
            'max_times_assignment_success',
            'Maximum time {time} ({seconds}s) assigned. Updated {updated} of {requested} combinations.'
          );
          const successMessage = successTemplate
            .replace('{time}', normalizedMaxTime)
            .replace('{seconds}', String(maxTimeSeconds))
            .replace('{updated}', String(data?.updated_competitions ?? 0))
            .replace('{requested}', String(data?.requested_pairs ?? (selectedCategories.length * selectedStyles.length)));

          showMessageModal(successMessage, t('max_times_info_title', 'Information'), 'success');
          maxTimesModal.hide();
          await fetchCompetitionsFromAPI();
        } catch (error) {
          console.error('Error assigning bulk max time:', error);
          showMessageModal(
            t('max_times_request_error', 'Error assigning maximum times.'),
            t('error_title', 'Error')
          );
        } finally {
          assignMaxTimesBtn.disabled = false;
          assignMaxTimesBtn.textContent = originalText;
        }
      });
    }

    resetBulkDeleteCompetitionsState();
});


async function loadCategories() {
  const categorySelect = document.getElementById('categoryDropdown');
  const categoryFilter = document.getElementById('categoryFilter');
  const defaultFilterOption = categoryFilter?.querySelector('option[value=""]')?.cloneNode(true);

  if (categorySelect) {
    categorySelect.innerHTML = '';
  }
  if (categoryFilter) {
    categoryFilter.innerHTML = '';
    if (defaultFilterOption) {
      categoryFilter.appendChild(defaultFilterOption);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching categories');
    const categories = await response.json();
    categoriesCatalog = categories.map(category => ({
      value: String(category?.id ?? category),
      label: String(category?.name ?? category)
    }));

    categories.forEach(category => {
      const value = category.id || category;
      const label = category.name || category;

      if (categorySelect) {
        const option1 = document.createElement('option');
        option1.value = value;
        option1.textContent = label;
        categorySelect.appendChild(option1);
      }

      if (categoryFilter) {
        const option2 = document.createElement('option');
        option2.value = label;
        option2.textContent = label;
        categoryFilter.appendChild(option2);
      }
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStyles() {
  const styleSelect = document.getElementById('styleDropdown');
  const styleFilter = document.getElementById('styleFilter');
  const selectedFilterValue = styleFilter ? styleFilter.value : '';
  const defaultFilterOption = styleFilter?.querySelector('option[value=""]')?.cloneNode(true);
  if (styleSelect) {
    styleSelect.innerHTML = '';
  }
  if (styleFilter) {
    styleFilter.innerHTML = '';
    if (defaultFilterOption) {
      styleFilter.appendChild(defaultFilterOption);
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = t('all_styles', 'All Styles');
      styleFilter.appendChild(option);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/styles?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching styles');
    const styles = await response.json();
    stylesCatalog = styles.map(style => ({
      value: String(style?.id ?? style),
      label: String(style?.name ?? style)
    }));

    styles.forEach(style => {
      const value = style.id || style;
      const label = style.name || style;

      if (styleSelect) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        styleSelect.appendChild(option);
      }

      if (styleFilter) {
        const filterOption = document.createElement('option');
        filterOption.value = label;
        filterOption.textContent = label;
        styleFilter.appendChild(filterOption);
      }
    });

    if (styleFilter) {
      const hasPreviousSelection = selectedFilterValue && styleFilter.querySelector(`option[value="${selectedFilterValue}"]`);
      styleFilter.value = hasPreviousSelection ? selectedFilterValue : '';
    }
  } catch (err) {
    console.error('Failed to load styles:', err);
  }
}

async function loadMasters() {
  const masterSelect = document.getElementById('editJudges');
  const reserveSelect = document.getElementById('editJudgeReserve');
  const headSelect = document.getElementById('editJudgeHead');
  masterSelect.innerHTML = ''; // Limpiar opciones anteriores
  if (reserveSelect && shouldShowReserveJudgeField()) {
    reserveSelect.innerHTML = `<option value=\"\">${t('ninguno')}</option>`;
  } else if (reserveSelect) {
    reserveSelect.innerHTML = '';
  }
  if (headSelect && shouldShowHeadJudgeField()) {
    headSelect.innerHTML = `<option value=\"\">${t('ninguno')}</option>`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/judges?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching masters');
    masters = await response.json();

    masters.forEach(master => {
      const option = document.createElement('option');
      option.value = master.id;
      option.textContent = master.name;
      masterSelect.appendChild(option);

      if (reserveSelect && shouldShowReserveJudgeField()) {
        const reserveOption = document.createElement('option');
        reserveOption.value = master.id;
        reserveOption.textContent = master.name;
        reserveSelect.appendChild(reserveOption);
      }

      if (headSelect && shouldShowHeadJudgeField()) {
        const headOption = document.createElement('option');
        headOption.value = master.id;
        headOption.textContent = master.name;
        headSelect.appendChild(headOption);
      }
    });
  } catch (err) {
    console.error('Failed to load masters:', err);
  }
}

async function deleteCompetition(competitionIdToDelete) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/${competitionIdToDelete}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      showMessageModal(data.error || 'Unknown error', 'Error eliminando la competiciÃ³n');
      return;
    }

  } catch (error) {
    console.error('Error al eliminar la competiciÃ³n:', error);
  }
}


function applyCategoryFilter() {
  const categoryFilter = document.getElementById('categoryFilter');
  const styleFilter = document.getElementById('styleFilter');
  const table = document.getElementById('competitionsTable');

  if (!categoryFilter || !table) return; // seguridad por si aún no existen en el DOM

  const selectedCategory = categoryFilter.value.toLowerCase();
  const selectedStyle = styleFilter ? styleFilter.value.toLowerCase() : '';
  const rows = table.querySelectorAll('tr');

  rows.forEach(row => {
    const category = row.children[0]?.textContent.trim().toLowerCase();
    const style = row.children[1]?.textContent.trim().toLowerCase();
    const categoryMatch = !selectedCategory || category === selectedCategory;
    const styleMatch = !selectedStyle || style === selectedStyle;

    if (categoryMatch && styleMatch) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });

  // Mostrar o no el empty state
  const visibleRows = Array.from(rows).filter(row => !row.classList.contains('d-none'));
  const totalParticipants = Array.from(rows).reduce((sum, row) => {
    return sum + (Number(row.dataset.num_dancers) || 0);
  }, 0);
  const visibleParticipants = visibleRows.reduce((sum, row) => {
    return sum + (Number(row.dataset.num_dancers) || 0);
  }, 0);

  updateCompetitionsCounter(rows.length, visibleRows.length, totalParticipants, visibleParticipants);
  document.getElementById('emptyState')?.classList.toggle('d-none', visibleRows.length > 0);
}
function updateCompetitionsCounter(totalCount, visibleCount, totalParticipants, visibleParticipants) {
  const competitionsCountEl = document.getElementById('count-competitions');
  const participantsCountEl = document.getElementById('count-participants');
  if (!competitionsCountEl && !participantsCountEl) return;

  const hasActiveFilter = Boolean(
    (document.getElementById('categoryFilter')?.value || '') ||
    (document.getElementById('styleFilter')?.value || '') ||
    document.getElementById('emptyParticipantsFilter')?.checked
  );
  if (hasActiveFilter) {
    if (competitionsCountEl) {
      competitionsCountEl.textContent = `${visibleCount} / ${totalCount} Comp.`;
    }
    if (participantsCountEl) {
      participantsCountEl.textContent = `${visibleParticipants} / ${totalParticipants} Part.`;
    }
    return;
  }

  if (competitionsCountEl) {
    competitionsCountEl.textContent = `${totalCount} Comp.`;
  }
  if (participantsCountEl) {
    participantsCountEl.textContent = `${totalParticipants} Part.`;
  }
}

async function deleteCompetition(competitionIdToDelete, { showErrorModal = true } = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/${competitionIdToDelete}`, {
      method: 'DELETE'
    });

    let data = null;
    try {
      data = await res.json();
    } catch (parseError) {
      data = null;
    }

    if (!res.ok) {
      const errorMessage = data?.error || data?.message || t('bulk_delete_competitions_delete_error', 'Error deleting competition.');
      if (showErrorModal) {
        showMessageModal(errorMessage, t('error_title', 'Error'));
      }
      return { ok: false, error: errorMessage };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error deleting competition:', error);
    const errorMessage = error?.message || t('bulk_delete_competitions_delete_error', 'Error deleting competition.');
    if (showErrorModal) {
      showMessageModal(errorMessage, t('error_title', 'Error'));
    }
    return { ok: false, error: errorMessage };
  }
}

function applyCategoryFilter() {
  const table = document.getElementById('competitionsTable');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tr'));
  const visibleCompetitions = getFilteredCompetitions();
  const visibleIds = new Set(visibleCompetitions.map((competition) => String(competition.id)));

  rows.forEach((row) => {
    row.classList.toggle('d-none', !visibleIds.has(String(row.dataset.id)));
  });

  const totalParticipants = (Array.isArray(competitions) ? competitions : []).reduce((sum, competition) => {
    return sum + (Number(competition?.num_dancers) || 0);
  }, 0);
  const visibleParticipants = visibleCompetitions.reduce((sum, competition) => {
    return sum + (Number(competition?.num_dancers) || 0);
  }, 0);

  updateCompetitionsCounter(rows.length, visibleCompetitions.length, totalParticipants, visibleParticipants);
  updateBulkDeleteCompetitionsButtonState(visibleCompetitions.length);
  document.getElementById('emptyState')?.classList.toggle('d-none', visibleCompetitions.length > 0);
}

function renderJudgesAssignmentList() {
  const list = document.getElementById('judgesAssignmentList');
  if (!list) return;
  const showHeadJudge = shouldShowHeadJudgeField();

  list.innerHTML = '';

  if (!masters.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('judges_assignment_no_judges');
    list.appendChild(empty);
    return;
  }

  masters.forEach(master => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center justify-content-between gap-2';

    const mainControl = document.createElement('div');
    mainControl.className = 'd-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input judge-assignment-checkbox';
    checkbox.value = master.id;

    const name = document.createElement('span');
    name.textContent = master.name;

    mainControl.appendChild(checkbox);
    mainControl.appendChild(name);
    item.appendChild(mainControl);

    if (showHeadJudge) {
      const headControl = document.createElement('div');
      headControl.className = 'form-check m-0 ms-auto';

      const headCheckbox = document.createElement('input');
      headCheckbox.type = 'checkbox';
      headCheckbox.className = 'form-check-input judge-assignment-head-checkbox';
      headCheckbox.value = master.id;
      headCheckbox.id = `assign-head-${master.id}`;
      headCheckbox.setAttribute('aria-label', t('col_judge_head', 'Head'));

      const headLabel = document.createElement('label');
      headLabel.className = 'form-check-label small text-muted';
      headLabel.htmlFor = headCheckbox.id;
      headLabel.textContent = t('col_judge_head', 'Head');

      headCheckbox.addEventListener('change', () => {
        if (!headCheckbox.checked) return;

        const allHeadCheckboxes = document.querySelectorAll('#judgesAssignmentList .judge-assignment-head-checkbox');
        allHeadCheckboxes.forEach(input => {
          if (input !== headCheckbox) {
            input.checked = false;
          }
        });

        checkbox.checked = true;
      });

      checkbox.addEventListener('change', () => {
        if (!checkbox.checked && headCheckbox.checked) {
          headCheckbox.checked = false;
        }
      });

      headControl.appendChild(headCheckbox);
      headControl.appendChild(headLabel);
      item.appendChild(headControl);
    }

    list.appendChild(item);
  });
}

function renderCompetitionsAssignmentList() {
  const list = document.getElementById('competitionsAssignmentList');
  if (!list) return;

  list.innerHTML = '';

  const availableCompetitions = competitions.filter(comp => comp.status !== 'FIN');

  if (!availableCompetitions.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('judges_assignment_no_competitions');
    list.appendChild(empty);
    return;
  }

  availableCompetitions.forEach(comp => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge bg-${statusColor[comp.status] || 'secondary'} ms-2`;
    statusBadge.textContent = convertStatus[comp.status] || comp.status;

    const formCheck = document.createElement('div');
    formCheck.className = 'form-check';

    const checkbox = document.createElement('input');
    const checkboxId = `assign-comp-${comp.id}`;
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.id = checkboxId;
    checkbox.dataset.compId = comp.id;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = checkboxId;

    const categorySpan = document.createElement('span');
    categorySpan.className = 'fw-semibold';
    categorySpan.textContent = comp.category_name;

    const styleSpan = document.createElement('span');
    styleSpan.className = 'text-muted ms-1';
    styleSpan.textContent = `/ ${comp.style_name}`;

    label.appendChild(categorySpan);
    label.appendChild(styleSpan);
    label.appendChild(statusBadge);

    formCheck.appendChild(checkbox);
    formCheck.appendChild(label);

    const result = document.createElement('span');
    result.className = 'small text-muted ms-auto';
    result.dataset.result = 'pending';
    result.textContent = t('judges_assignment_status_pending');

    item.appendChild(formCheck);
    item.appendChild(result);

    list.appendChild(item);
  });
}

function getSelectedAssignmentJudges() {
  return Array.from(document.querySelectorAll('#judgesAssignmentList input[type="checkbox"]:checked'))
    .filter(input => input.classList.contains('judge-assignment-checkbox'))
    .map(input => input.value);
}

function getSelectedAssignmentHeadJudge() {
  const headInput = document.querySelector('#judgesAssignmentList .judge-assignment-head-checkbox:checked');
  return headInput ? headInput.value : null;
}

function getSelectedAssignmentCompetitions() {
  return Array.from(document.querySelectorAll('#competitionsAssignmentList input[type="checkbox"]:checked'))
    .map(input => input.dataset.compId);
}

function resetSubstituteJudgeState() {
  substituteJudgeState.sourceJudgeId = '';
  substituteJudgeState.replacementJudgeId = '';
  substituteJudgeState.competitions = [];
  substituteJudgeState.selectedCompetitionIds = new Set();
  substituteJudgeState.loading = false;
}

function populateSubstituteJudgeSelect(selectEl, { includeEmpty = true, excludeJudgeId = '' } = {}) {
  if (!selectEl) return;

  const currentValue = String(selectEl.value || '').trim();
  selectEl.innerHTML = '';

  if (includeEmpty) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = t('ninguno', 'Ninguno');
    selectEl.appendChild(emptyOption);
  }

  masters.forEach((master) => {
    const masterId = String(master?.id ?? '').trim();
    if (!masterId) return;
    if (excludeJudgeId && masterId === String(excludeJudgeId)) return;

    const option = document.createElement('option');
    option.value = masterId;
    option.textContent = master?.name || masterId;
    selectEl.appendChild(option);
  });

  if (currentValue && Array.from(selectEl.options).some(option => option.value === currentValue)) {
    selectEl.value = currentValue;
  }
}

function populateSubstituteJudgeSelects() {
  const sourceSelect = document.getElementById('substituteJudgeSourceSelect');
  const replacementSelect = document.getElementById('substituteJudgeReplacementSelect');
  populateSubstituteJudgeSelect(sourceSelect);
  populateSubstituteJudgeSelect(replacementSelect, {
    excludeJudgeId: substituteJudgeState.sourceJudgeId
  });

  if (sourceSelect) {
    sourceSelect.value = substituteJudgeState.sourceJudgeId || '';
  }
  if (replacementSelect) {
    replacementSelect.value = substituteJudgeState.replacementJudgeId || '';
  }
}

function updateSubstituteJudgeReplacementOptions() {
  const replacementSelect = document.getElementById('substituteJudgeReplacementSelect');
  if (!replacementSelect) return;

  const currentReplacementId = String(substituteJudgeState.replacementJudgeId || '').trim();
  populateSubstituteJudgeSelect(replacementSelect, {
    excludeJudgeId: substituteJudgeState.sourceJudgeId
  });

  if (
    currentReplacementId &&
    Array.from(replacementSelect.options).some(option => option.value === currentReplacementId)
  ) {
    replacementSelect.value = currentReplacementId;
    substituteJudgeState.replacementJudgeId = currentReplacementId;
  } else {
    replacementSelect.value = '';
    substituteJudgeState.replacementJudgeId = '';
  }
}

function renderSubstituteJudgeCompetitionsList() {
  const list = document.getElementById('substituteJudgeCompetitionsList');
  if (!list) return;

  list.innerHTML = '';

  if (substituteJudgeState.loading) {
    const loading = document.createElement('div');
    loading.className = 'list-group-item text-muted';
    loading.textContent = t('substitute_judge_loading', 'Cargando competiciones...');
    list.appendChild(loading);
    return;
  }

  if (!substituteJudgeState.sourceJudgeId) {
    const empty = document.createElement('div');
    empty.className = 'list-group-item text-muted';
    empty.textContent = t('substitute_judge_select_prompt', 'Selecciona un juez y pulsa Obtener datos.');
    list.appendChild(empty);
    return;
  }

  if (!substituteJudgeState.competitions.length) {
    const empty = document.createElement('div');
    empty.className = 'list-group-item text-muted';
    empty.textContent = t('substitute_judge_no_competitions', 'No hay competiciones CLOSED para este juez.');
    list.appendChild(empty);
    return;
  }

  substituteJudgeState.competitions.forEach((competition) => {
    const item = document.createElement('label');
    item.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

    const leftWrap = document.createElement('div');
    leftWrap.className = 'd-flex align-items-start gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input mt-1 substitute-judge-competition-checkbox';
    checkbox.dataset.competitionId = String(competition.id);
    checkbox.checked = substituteJudgeState.selectedCompetitionIds.has(String(competition.id));

    const textWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'fw-semibold';
    title.textContent = `${competition.category_name || ''} / ${competition.style_name || ''}`;
    const criteriaBadges = document.createElement('div');
    criteriaBadges.className = 'd-flex flex-wrap gap-1 mt-1';

    normalizeSubstituteJudgeCriteriaList(competition.criteria_list).forEach((criterionName) => {
      const badge = document.createElement('span');
      badge.className = 'badge text-bg-info';
      badge.textContent = criterionName;
      criteriaBadges.appendChild(badge);
    });

    textWrap.appendChild(title);
    if (criteriaBadges.childElementCount) {
      textWrap.appendChild(criteriaBadges);
    }
    leftWrap.appendChild(checkbox);
    leftWrap.appendChild(textWrap);

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge bg-${statusColor[competition.status] || 'secondary'}`;
    statusBadge.textContent = convertStatus[competition.status] || competition.status || '';

    item.appendChild(leftWrap);
    item.appendChild(statusBadge);
    list.appendChild(item);
  });
}

function normalizeSubstituteJudgeCriteriaList(criteriaList) {
  if (typeof criteriaList === 'string') {
    return criteriaList
      .split(',')
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }

  if (!Array.isArray(criteriaList)) return [];

  return criteriaList
    .map((criterion) => {
      if (criterion === null || criterion === undefined) return '';
      if (typeof criterion === 'string' || typeof criterion === 'number') {
        return String(criterion).trim();
      }

      const candidate = criterion.name ?? criterion.criteria_name ?? criterion.label ?? criterion.criterion_name;
      return String(candidate || '').trim();
    })
    .filter(Boolean);
}

function updateSubstituteJudgeSelectAllState() {
  const selectAll = document.getElementById('substituteJudgeSelectAllCompetitions');
  if (!selectAll) return;

  const totalCompetitions = substituteJudgeState.competitions.length;
  const selectedCount = substituteJudgeState.selectedCompetitionIds.size;

  selectAll.disabled = substituteJudgeState.loading || totalCompetitions === 0;
  selectAll.checked = totalCompetitions > 0 && selectedCount === totalCompetitions;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCompetitions;
}

function updateSubstituteJudgeApplyButtonState() {
  const applyButton = document.getElementById('performSubstituteJudgeBtn');
  if (!applyButton) return;

  const hasSourceJudge = Boolean(String(substituteJudgeState.sourceJudgeId || '').trim());
  const hasReplacementJudge = Boolean(String(substituteJudgeState.replacementJudgeId || '').trim());
  const hasSelectedCompetitions = substituteJudgeState.selectedCompetitionIds.size > 0;

  applyButton.disabled = substituteJudgeState.loading || !hasSourceJudge || !hasReplacementJudge || !hasSelectedCompetitions;
}

async function loadSubstituteJudgeCompetitions(judgeId, triggerButton = null) {
  substituteJudgeState.loading = true;
  substituteJudgeState.competitions = [];
  substituteJudgeState.selectedCompetitionIds.clear();
  renderSubstituteJudgeCompetitionsList();
  updateSubstituteJudgeSelectAllState();
  updateSubstituteJudgeApplyButtonState();

  const originalButtonText = triggerButton?.textContent || t('substitute_judge_fetch_button', 'Obtener datos');
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = t('substitute_judge_loading', 'Cargando competiciones...');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/voting/competitions?event_id=${getEvent().id}&judge_id=${judgeId}`);
    const data = await response.json().catch(() => ([]));
    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || t('substitute_judge_fetch_error', 'Error al obtener las competiciones del juez.')
      );
    }

    substituteJudgeState.competitions = (Array.isArray(data) ? data : [])
      .filter(comp => String(comp?.status || '').toUpperCase() === 'CLO');
  } catch (error) {
    console.error('Error loading substitute judge competitions:', error);
    showMessageModal(
      error?.message || t('substitute_judge_fetch_error', 'Error al obtener las competiciones del juez.'),
      t('error_title', 'Error')
    );
    substituteJudgeState.competitions = [];
  } finally {
    substituteJudgeState.loading = false;
    renderSubstituteJudgeCompetitionsList();
    updateSubstituteJudgeSelectAllState();
    updateSubstituteJudgeApplyButtonState();
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = originalButtonText;
    }
  }
}

async function submitSubstituteJudgeReplacement(triggerButton = null) {
  const sourceJudgeId = String(substituteJudgeState.sourceJudgeId || '').trim();
  const replacementJudgeId = String(substituteJudgeState.replacementJudgeId || '').trim();
  const selectedCompetitions = Array.from(substituteJudgeState.selectedCompetitionIds);

  if (!sourceJudgeId) {
    showMessageModal(
      t('substitute_judge_missing_source', 'Selecciona un juez.'),
      t('error_title', 'Error')
    );
    return;
  }

  if (!replacementJudgeId) {
    showMessageModal(
      t('substitute_judge_missing_replacement', 'Selecciona un juez sustituto.'),
      t('error_title', 'Error')
    );
    return;
  }

  if (!selectedCompetitions.length) {
    showMessageModal(
      t('substitute_judge_missing_competitions', 'Selecciona al menos una competición.'),
      t('error_title', 'Error')
    );
    return;
  }

  const payload = {
    event_id: getEvent().id,
    judge_id_ori: Number.isFinite(Number(sourceJudgeId)) ? Number(sourceJudgeId) : sourceJudgeId,
    judge_id_des: Number.isFinite(Number(replacementJudgeId)) ? Number(replacementJudgeId) : replacementJudgeId,
    competitions: selectedCompetitions.map((competitionId) => (
      Number.isFinite(Number(competitionId)) ? Number(competitionId) : competitionId
    ))
  };

  const originalButtonText = triggerButton?.textContent || t('substitute_judge_apply_button', 'Realizar substitución');
  substituteJudgeState.loading = true;
  updateSubstituteJudgeApplyButtonState();
  updateSubstituteJudgeSelectAllState();

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = t('substitute_judge_status_updating', 'Realizando substitución...');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/replace-judge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || t('substitute_judge_request_error', 'Error al realizar la substitución de juez.')
      );
    }

    await fetchCompetitionsFromAPI();
    await loadSubstituteJudgeCompetitions(sourceJudgeId);

    showMessageModal(
      data?.message || t('substitute_judge_success', 'Substitución de juez realizada correctamente.'),
      t('max_times_info_title', 'Información'),
      'success'
    );
  } catch (error) {
    console.error('Error replacing judge:', error);
    showMessageModal(
      error?.message || t('substitute_judge_request_error', 'Error al realizar la substitución de juez.'),
      t('error_title', 'Error')
    );
  } finally {
    substituteJudgeState.loading = false;
    updateSubstituteJudgeApplyButtonState();
    updateSubstituteJudgeSelectAllState();
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = originalButtonText;
    }
  }
}

function prepareCriteriaPerJudgeAssignmentModal() {
  clearCriteriaPerJudgeSelections();
  criteriaPerJudgeState.groups = buildCriteriaPerJudgeGroups();
  criteriaPerJudgeState.groupsByKey = new Map(
    criteriaPerJudgeState.groups.map(group => [group.key, group])
  );
  renderCriteriaPerJudgeGroupsAccordion();
  renderCriteriaPerJudgeMappingPanel();
}

function clearCriteriaPerJudgeSelections() {
  criteriaPerJudgeState.selectedGroupKey = null;
  criteriaPerJudgeState.selectedCompetitionIds.clear();
  resetCriteriaPerJudgePairAssignments(criteriaPerJudgeState);
}

function buildCriteriaPerJudgeGroups() {
  const groupsMap = new Map();
  const eligibleCompetitions = (Array.isArray(competitions) ? competitions : [])
    .filter(comp => CRITERIA_PER_JUDGE_ALLOWED_STATUSES.has(String(comp?.status || '').toUpperCase()));

  eligibleCompetitions.forEach((competition) => {
    const criteria = normalizeCriteriaPerJudgeCriteria(competition?.criteria);
    const judges = normalizeCriteriaPerJudgeJudges(competition?.judges);
    const criteriaKey = criteria.map(item => item.id).join('|');
    const judgesKey = judges.map(item => item.id).join('|');
    const key = `criteria:${criteriaKey}__judges:${judgesKey}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        criteria,
        judges,
        competitions: []
      });
    }

    groupsMap.get(key).competitions.push(competition);
  });

  return Array.from(groupsMap.values())
    .map(group => ({
      ...group,
      competitions: group.competitions
        .slice()
        .sort((a, b) => {
          const categoryCompare = String(a?.category_name || '').localeCompare(String(b?.category_name || ''));
          if (categoryCompare !== 0) return categoryCompare;
          return String(a?.style_name || '').localeCompare(String(b?.style_name || ''));
        })
    }))
    .sort((a, b) => b.competitions.length - a.competitions.length);
}

function normalizeCriteriaPerJudgeCriteria(criteriaList = []) {
  const criteriaMap = new Map();
  (Array.isArray(criteriaList) ? criteriaList : []).forEach((criterion, index) => {
    const rawId = criterion?.id ?? criterion?.name ?? `criterion-${index + 1}`;
    const id = String(rawId);
    if (!id || criteriaMap.has(id)) return;

    const rawPosition = Number(criterion?.position);
    criteriaMap.set(id, {
      id,
      name: String(criterion?.name ?? id),
      position: Number.isFinite(rawPosition) ? rawPosition : (index + 1)
    });
  });

  return Array.from(criteriaMap.values())
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });
}

function normalizeCriteriaPerJudgeJudges(judgesList = []) {
  const judgesMap = new Map();
  (Array.isArray(judgesList) ? judgesList : []).forEach((judge, index) => {
    const rawId = judge?.id ?? judge?.name ?? `judge-${index + 1}`;
    const id = String(rawId);
    if (!id || judgesMap.has(id)) return;

    judgesMap.set(id, {
      id,
      name: String(judge?.name ?? id)
    });
  });

  return Array.from(judgesMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resetCriteriaPerJudgePairAssignments(state) {
  state.pairAssignments = [];
  state.nextPairRowId = 1;
}

function createCriteriaPerJudgePairAssignment(state, pair = {}) {
  const rawCriterionId = pair?.criterionId ?? pair?.criteria_id ?? pair?.criteriaId ?? '';
  const rawJudgeId = pair?.judgeId ?? pair?.judge_id ?? pair?.judgeId ?? '';

  return {
    rowId: `pair-${state.nextPairRowId++}`,
    criterionId: String(rawCriterionId || '').trim(),
    judgeId: String(rawJudgeId || '').trim()
  };
}

function addCriteriaPerJudgePairAssignment(state, pair = {}) {
  const nextPair = createCriteriaPerJudgePairAssignment(state, pair);
  state.pairAssignments.push(nextPair);
  return nextPair;
}

function setCriteriaPerJudgePairAssignments(state, pairs = [], criteria = [], judges = []) {
  const validCriteriaIds = new Set(criteria.map(item => String(item.id)));
  const validJudgeIds = new Set(judges.map(item => String(item.id)));
  resetCriteriaPerJudgePairAssignments(state);

  (Array.isArray(pairs) ? pairs : []).forEach((pair) => {
    const normalizedPair = createCriteriaPerJudgePairAssignment(state, pair);
    if (!normalizedPair.criterionId || !normalizedPair.judgeId) return;
    if (validCriteriaIds.size && !validCriteriaIds.has(normalizedPair.criterionId)) return;
    if (validJudgeIds.size && !validJudgeIds.has(normalizedPair.judgeId)) return;
    state.pairAssignments.push(normalizedPair);
  });
}

function ensureCriteriaPerJudgeEditablePairAssignment(state, canEdit = true) {
  if (!canEdit) return;
  if (!Array.isArray(state.pairAssignments) || !state.pairAssignments.length) {
    addCriteriaPerJudgePairAssignment(state);
  }
}

function updateCriteriaPerJudgePairAssignment(state, rowId, field, value) {
  if (!['criterionId', 'judgeId'].includes(field)) return;
  const targetPair = (Array.isArray(state.pairAssignments) ? state.pairAssignments : [])
    .find(pair => String(pair.rowId) === String(rowId));
  if (!targetPair) return;
  targetPair[field] = String(value || '').trim();
}

function removeCriteriaPerJudgePairAssignment(state, rowId, canEdit = true) {
  state.pairAssignments = (Array.isArray(state.pairAssignments) ? state.pairAssignments : [])
    .filter(pair => String(pair.rowId) !== String(rowId));
  ensureCriteriaPerJudgeEditablePairAssignment(state, canEdit);
}

function collectCriteriaPerJudgeAssignedPairs(state) {
  const pairs = [];
  const incompleteRows = [];
  const duplicateRows = [];
  const seenPairs = new Set();

  (Array.isArray(state?.pairAssignments) ? state.pairAssignments : []).forEach((pair, index) => {
    const criterionId = String(pair?.criterionId || '').trim();
    const judgeId = String(pair?.judgeId || '').trim();

    if (!criterionId && !judgeId) return;

    if (!criterionId || !judgeId) {
      incompleteRows.push(index + 1);
      return;
    }

    const duplicateKey = `${criterionId}__${judgeId}`;
    if (seenPairs.has(duplicateKey)) {
      duplicateRows.push(index + 1);
      return;
    }

    seenPairs.add(duplicateKey);
    pairs.push({
      criterionId,
      judgeId,
      rowIndex: index + 1
    });
  });

  return {
    pairs,
    incompleteRows,
    duplicateRows
  };
}

function buildCriteriaPerJudgePayloadPairs(pairs = []) {
  return pairs.map((pair) => {
    const parsedCriteriaId = Number(pair.criterionId);
    const parsedJudgeId = Number(pair.judgeId);
    return {
      criteria_id: Number.isFinite(parsedCriteriaId) ? parsedCriteriaId : pair.criterionId,
      judge_id: Number.isFinite(parsedJudgeId) ? parsedJudgeId : pair.judgeId
    };
  });
}

function appendCriteriaPerJudgeBadgeSection(container, title, items, options = {}) {
  const {
    emptyText = '',
    formatItem = (item) => item?.name ?? String(item ?? ''),
    marginClass = 'mb-3',
    count = null
  } = options;

  const sectionTitleWrap = document.createElement('div');
  sectionTitleWrap.className = 'd-flex align-items-center gap-2 mb-2';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'fw-semibold';
  sectionTitle.textContent = title;
  sectionTitleWrap.appendChild(sectionTitle);

  if (count !== null) {
    const countBadge = document.createElement('span');
    countBadge.className = 'badge bg-secondary rounded-pill';
    countBadge.textContent = String(count);
    sectionTitleWrap.appendChild(countBadge);
  }

  container.appendChild(sectionTitleWrap);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = `small text-muted ${marginClass}`.trim();
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = `d-flex flex-wrap gap-2 ${marginClass}`.trim();
  items.forEach((item) => {
    const badge = document.createElement('span');
    badge.className = 'badge bg-secondary';
    badge.textContent = formatItem(item);
    wrap.appendChild(badge);
  });
  container.appendChild(wrap);
}

function createCriteriaPerJudgePairSelect(items, config = {}) {
  const {
    placeholderText = '',
    selectedValue = '',
    disabled = false,
    context = '',
    rowId = '',
    field = '',
    formatter = (item) => item?.name ?? String(item ?? '')
  } = config;

  const select = document.createElement('select');
  select.className = 'form-select form-select-sm criteria-per-judge-pair-select';
  select.disabled = disabled;
  select.dataset.context = context;
  select.dataset.rowId = String(rowId);
  select.dataset.field = field;
  select.setAttribute('aria-label', placeholderText);

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholderText;
  select.appendChild(placeholderOption);

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = formatter(item);
    select.appendChild(option);
  });

  const normalizedSelectedValue = String(selectedValue || '').trim();
  if (normalizedSelectedValue) {
    select.value = normalizedSelectedValue;
  }

  return select;
}

function renderCriteriaPerJudgePairEditor(container, config = {}) {
  const {
    state,
    criteria,
    judges,
    canEdit = true,
    context = '',
    title = t('criteria_per_judge_pairs_title', 'Pares criterio-juez'),
    emptyText = t('criteria_per_judge_no_pairs', 'No hay pares configurados.')
  } = config;

  const header = document.createElement('div');
  header.className = 'd-flex align-items-center justify-content-between gap-2 mb-2';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'fw-semibold';
  sectionTitle.textContent = title;
  header.appendChild(sectionTitle);

  if (canEdit) {
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn-outline-primary btn-sm criteria-per-judge-pair-add-btn';
    addButton.dataset.context = context;
    addButton.innerHTML = `<i class="bi bi-plus-lg me-1"></i>${t('criteria_per_judge_add_pair', 'Anadir par')}`;
    header.appendChild(addButton);
  }

  container.appendChild(header);

  if (!canEdit && !state.pairAssignments.length) {
    const empty = document.createElement('div');
    empty.className = 'small text-muted';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  ensureCriteriaPerJudgeEditablePairAssignment(state, canEdit);

  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'd-flex flex-column gap-2';

  state.pairAssignments.forEach((pair) => {
    const rowCard = document.createElement('div');
    rowCard.className = 'border rounded-3 p-3';

    const row = document.createElement('div');
    row.className = 'row g-2 align-items-end';

    const criterionCol = document.createElement('div');
    criterionCol.className = 'col-12 col-md-5';
    const criterionSelect = createCriteriaPerJudgePairSelect(criteria, {
      placeholderText: t('criteria_per_judge_select_criterion', 'Selecciona criterio'),
      selectedValue: pair.criterionId,
      disabled: !canEdit,
      context,
      rowId: pair.rowId,
      field: 'criterionId',
      formatter: (criterion) => `${criterion.position}. ${criterion.name}`
    });
    criterionCol.appendChild(criterionSelect);

    const judgeCol = document.createElement('div');
    judgeCol.className = 'col-12 col-md-5';
    const judgeSelect = createCriteriaPerJudgePairSelect(judges, {
      placeholderText: t('criteria_per_judge_select_judge', 'Selecciona juez'),
      selectedValue: pair.judgeId,
      disabled: !canEdit,
      context,
      rowId: pair.rowId,
      field: 'judgeId'
    });
    judgeCol.appendChild(judgeSelect);

    const actionsCol = document.createElement('div');
    actionsCol.className = 'col-12 col-md-2 d-grid';
    if (canEdit) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm criteria-per-judge-pair-remove-btn';
      removeButton.dataset.context = context;
      removeButton.dataset.rowId = String(pair.rowId);
      removeButton.innerHTML = `<i class="bi bi-trash"></i>`;
      removeButton.title = t('criteria_per_judge_remove_pair', 'Eliminar par');
      removeButton.setAttribute('aria-label', t('criteria_per_judge_remove_pair', 'Eliminar par'));
      actionsCol.appendChild(removeButton);
    }

    row.appendChild(criterionCol);
    row.appendChild(judgeCol);
    row.appendChild(actionsCol);
    rowCard.appendChild(row);
    rowsWrap.appendChild(rowCard);
  });

  container.appendChild(rowsWrap);
}

function validateCriteriaPerJudgePairCoverage(criteria, judges, state) {
  const { pairs, incompleteRows, duplicateRows } = collectCriteriaPerJudgeAssignedPairs(state);

  if (incompleteRows.length) {
    return {
      valid: false,
      message: t(
        'criteria_per_judge_incomplete_pairs',
        'Completa o elimina las lineas incompletas: {rows}.'
      ).replace('{rows}', incompleteRows.join(', '))
    };
  }

  if (duplicateRows.length) {
    return {
      valid: false,
      message: t(
        'criteria_per_judge_duplicate_pairs',
        'No repitas el mismo par criterio-juez. Revisa las lineas: {rows}.'
      ).replace('{rows}', duplicateRows.join(', '))
    };
  }

  const assignedCriteriaIds = new Set(pairs.map(pair => pair.criterionId));
  const missingCriteriaAssignments = criteria.filter((criterion) => {
    return !assignedCriteriaIds.has(String(criterion.id));
  });

  if (missingCriteriaAssignments.length) {
    return {
      valid: false,
      message: t(
        'criteria_per_judge_missing_criteria_assignment',
        'Todos los criterios deben tener al menos un juez asignado.'
      )
    };
  }

  const assignedJudgeIds = new Set(pairs.map(pair => pair.judgeId));
  const judgesWithoutCriteria = judges
    .filter(judge => !assignedJudgeIds.has(String(judge.id)));

  if (judgesWithoutCriteria.length) {
    return {
      valid: false,
      message: t(
        'criteria_per_judge_unused_judges',
        'Todos los jueces deben estar asociados a algun criterio: {judges}.'
      ).replace('{judges}', judgesWithoutCriteria.map(judge => judge.name).join(', '))
    };
  }

  return {
    valid: true,
    pairs
  };
}

function renderCriteriaPerJudgeGroupsAccordion() {
  const container = document.getElementById('criteriaPerJudgeGroupsAccordion');
  if (!container) return;

  container.innerHTML = '';

  if (!criteriaPerJudgeState.groups.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t(
      'criteria_per_judge_no_competitions',
      'No hay competiciones en estado OPEN o IN PROGRESS.'
    );
    container.appendChild(empty);
    return;
  }

  criteriaPerJudgeState.groups.forEach((group, groupIndex) => {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const headerId = `criteria-per-judge-group-heading-${groupIndex}`;
    const collapseId = `criteria-per-judge-group-collapse-${groupIndex}`;
    const isSelectedGroup = criteriaPerJudgeState.selectedGroupKey === group.key;

    const header = document.createElement('h2');
    header.className = 'accordion-header';
    header.id = headerId;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = `accordion-button ${isSelectedGroup ? '' : 'collapsed'}`;
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('data-bs-toggle', 'collapse');
    toggleBtn.setAttribute('data-bs-target', `#${collapseId}`);
    toggleBtn.setAttribute('aria-expanded', isSelectedGroup ? 'true' : 'false');
    toggleBtn.setAttribute('aria-controls', collapseId);

    const groupTitle = t('criteria_per_judge_group_title', 'Grupo {index}')
      .replace('{index}', String(groupIndex + 1));
    const groupSummary = t(
      'criteria_per_judge_group_summary',
      '{competitions} competiciones | {criteria} criterios | {judges} jueces'
    )
      .replace('{competitions}', String(group.competitions.length))
      .replace('{criteria}', String(group.criteria.length))
      .replace('{judges}', String(group.judges.length));

    const headerContent = document.createElement('div');
    headerContent.className = 'd-flex flex-column';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'fw-semibold';
    headerTitle.textContent = groupTitle;
    const headerSummary = document.createElement('span');
    headerSummary.className = 'small text-muted';
    headerSummary.textContent = groupSummary;
    headerContent.appendChild(headerTitle);
    headerContent.appendChild(headerSummary);

    toggleBtn.appendChild(headerContent);
    header.appendChild(toggleBtn);

    const collapse = document.createElement('div');
    collapse.id = collapseId;
    collapse.className = `accordion-collapse collapse ${isSelectedGroup ? 'show' : ''}`;
    collapse.setAttribute('aria-labelledby', headerId);
    collapse.setAttribute('data-bs-parent', '#criteriaPerJudgeGroupsAccordion');

    const body = document.createElement('div');
    body.className = 'accordion-body p-2';

    const selectedCompetitionCount = group.competitions.filter(
      competition => criteriaPerJudgeState.selectedCompetitionIds.has(String(competition.id))
    ).length;
    const isAllSelected = group.competitions.length > 0
      && selectedCompetitionCount === group.competitions.length;
    const isPartiallySelected = selectedCompetitionCount > 0
      && selectedCompetitionCount < group.competitions.length;

    const selectAllWrap = document.createElement('div');
    selectAllWrap.className = 'form-check mb-2';

    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.className = 'form-check-input criteria-per-judge-group-select-all';
    selectAllCheckbox.dataset.groupKey = group.key;
    selectAllCheckbox.id = `criteria-per-judge-group-select-all-${groupIndex}`;
    selectAllCheckbox.checked = isAllSelected;
    selectAllCheckbox.indeterminate = isPartiallySelected;

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'form-check-label fw-semibold';
    selectAllLabel.htmlFor = selectAllCheckbox.id;
    selectAllLabel.textContent = t('criteria_per_judge_select_all', 'Seleccionar todos');

    selectAllWrap.appendChild(selectAllCheckbox);
    selectAllWrap.appendChild(selectAllLabel);
    body.appendChild(selectAllWrap);

    const list = document.createElement('div');
    list.className = 'list-group';

    group.competitions.forEach((competition) => {
      const row = document.createElement('div');
      row.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

      const check = document.createElement('div');
      check.className = 'form-check w-100';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input criteria-per-judge-comp-checkbox';
      checkbox.dataset.groupKey = group.key;
      checkbox.dataset.compId = String(competition.id);
      checkbox.id = `criteria-per-judge-comp-${groupIndex}-${competition.id}`;
      checkbox.checked = criteriaPerJudgeState.selectedCompetitionIds.has(String(competition.id));

      const label = document.createElement('label');
      label.className = 'form-check-label w-100';
      label.htmlFor = checkbox.id;

      const titleLine = document.createElement('div');
      titleLine.className = 'fw-semibold';
      titleLine.textContent = `${competition.category_name} / ${competition.style_name}`;

      label.appendChild(titleLine);
      check.appendChild(checkbox);
      check.appendChild(label);

      row.appendChild(check);
      row.appendChild(createCriteriaPerJudgeCompetitionStatusBadge(competition.status));
      list.appendChild(row);
    });

    body.appendChild(list);
    collapse.appendChild(body);
    item.appendChild(header);
    item.appendChild(collapse);
    container.appendChild(item);
  });
}

function createCriteriaPerJudgeCompetitionStatusBadge(status) {
  const badge = document.createElement('span');
  badge.className = `badge bg-${statusColor[status] || 'secondary'}`;
  badge.textContent = convertStatus[status] || status || '-';
  return badge;
}

function handleCriteriaPerJudgeGroupSelectAllChange(inputEl) {
  const groupKey = String(inputEl?.dataset?.groupKey || '');
  const shouldSelectAll = Boolean(inputEl?.checked);
  if (!groupKey) return;

  const group = criteriaPerJudgeState.groupsByKey.get(groupKey);
  if (!group) return;

  const isSwitchingGroup = shouldSelectAll
    && criteriaPerJudgeState.selectedGroupKey
    && criteriaPerJudgeState.selectedGroupKey !== groupKey;

  if (isSwitchingGroup) {
    criteriaPerJudgeState.selectedCompetitionIds.clear();
    resetCriteriaPerJudgePairAssignments(criteriaPerJudgeState);
  }

  if (shouldSelectAll) {
    criteriaPerJudgeState.selectedGroupKey = groupKey;
    group.competitions.forEach((competition) => {
      criteriaPerJudgeState.selectedCompetitionIds.add(String(competition.id));
    });
  } else if (criteriaPerJudgeState.selectedGroupKey === groupKey) {
    group.competitions.forEach((competition) => {
      criteriaPerJudgeState.selectedCompetitionIds.delete(String(competition.id));
    });

    if (!criteriaPerJudgeState.selectedCompetitionIds.size) {
      criteriaPerJudgeState.selectedGroupKey = null;
      resetCriteriaPerJudgePairAssignments(criteriaPerJudgeState);
    }
  }

  renderCriteriaPerJudgeGroupsAccordion();
  renderCriteriaPerJudgeMappingPanel();
}

function handleCriteriaPerJudgeCompetitionSelectionChange(inputEl) {
  const compId = String(inputEl?.dataset?.compId || '');
  const groupKey = String(inputEl?.dataset?.groupKey || '');
  const isChecked = Boolean(inputEl?.checked);
  if (!compId || !groupKey) return;

  const isSwitchingGroup = isChecked
    && criteriaPerJudgeState.selectedGroupKey
    && criteriaPerJudgeState.selectedGroupKey !== groupKey;

  if (isSwitchingGroup) {
    criteriaPerJudgeState.selectedCompetitionIds.clear();
    resetCriteriaPerJudgePairAssignments(criteriaPerJudgeState);
    document.querySelectorAll('#criteriaPerJudgeGroupsAccordion .criteria-per-judge-comp-checkbox:checked')
      .forEach(checkbox => {
        checkbox.checked = false;
      });
    inputEl.checked = true;
  }

  if (isChecked) {
    criteriaPerJudgeState.selectedGroupKey = groupKey;
    criteriaPerJudgeState.selectedCompetitionIds.add(compId);
  } else {
    criteriaPerJudgeState.selectedCompetitionIds.delete(compId);
    if (!criteriaPerJudgeState.selectedCompetitionIds.size) {
      criteriaPerJudgeState.selectedGroupKey = null;
      resetCriteriaPerJudgePairAssignments(criteriaPerJudgeState);
    }
  }

  renderCriteriaPerJudgeGroupsAccordion();
  renderCriteriaPerJudgeMappingPanel();
}

function renderCriteriaPerJudgeMappingPanel() {
  const panel = document.getElementById('criteriaPerJudgeMappingPanel');
  if (!panel) return;

  panel.innerHTML = '';

  const selectedGroup = criteriaPerJudgeState.selectedGroupKey
    ? criteriaPerJudgeState.groupsByKey.get(criteriaPerJudgeState.selectedGroupKey)
    : null;

  if (!selectedGroup || !criteriaPerJudgeState.selectedCompetitionIds.size) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t(
      'criteria_per_judge_select_prompt',
      'Selecciona competiciones de una agrupacion para relacionar criterios y jueces.'
    );
    panel.appendChild(empty);
    return;
  }

  const selectedCompetitions = selectedGroup.competitions
    .filter(comp => criteriaPerJudgeState.selectedCompetitionIds.has(String(comp.id)));

  appendCriteriaPerJudgeBadgeSection(
    panel,
    t('criteria_per_judge_selected_competitions', 'Competiciones seleccionadas'),
    selectedCompetitions,
    {
      count: selectedCompetitions.length,
      formatItem: (competition) => `${competition.category_name} / ${competition.style_name}`
    }
  );

  appendCriteriaPerJudgeBadgeSection(
    panel,
    t('criteria_per_judge_available_judges', 'Jueces disponibles'),
    selectedGroup.judges,
    {
      emptyText: t('criteria_per_judge_no_judges', 'No hay jueces en esta agrupacion.')
    }
  );

  appendCriteriaPerJudgeBadgeSection(
    panel,
    t('criteria_per_judge_available_criteria', 'Criterios disponibles'),
    selectedGroup.criteria,
    {
      emptyText: t('criteria_per_judge_no_criteria', 'No hay criterios en esta agrupacion.'),
      formatItem: (criterion) => `${criterion.position}. ${criterion.name}`
    }
  );

  if (!selectedGroup.criteria.length || !selectedGroup.judges.length) {
    return;
  }

  renderCriteriaPerJudgePairEditor(panel, {
    state: criteriaPerJudgeState,
    criteria: selectedGroup.criteria,
    judges: selectedGroup.judges,
    canEdit: true,
    context: 'bulk'
  });
}

function handleCriteriaPerJudgePairSelectionChange(selectEl, state) {
  const rowId = String(selectEl?.dataset?.rowId || '');
  const field = String(selectEl?.dataset?.field || '');
  if (!rowId || !field) return;
  updateCriteriaPerJudgePairAssignment(state, rowId, field, selectEl.value);
}

async function handleCriteriaPerJudgeAssignmentSubmit() {
  const errorTitle = t('error_title', 'Error');
  const selectedGroup = criteriaPerJudgeState.selectedGroupKey
    ? criteriaPerJudgeState.groupsByKey.get(criteriaPerJudgeState.selectedGroupKey)
    : null;

  if (!selectedGroup || !criteriaPerJudgeState.selectedCompetitionIds.size) {
    showMessageModal(
      t('criteria_per_judge_missing_selection', 'Selecciona al menos una competicion.'),
      errorTitle
    );
    return;
  }

  if (!selectedGroup.criteria.length) {
    showMessageModal(
      t('criteria_per_judge_no_criteria', 'No hay criterios en esta agrupacion.'),
      errorTitle
    );
    return;
  }

  if (!selectedGroup.judges.length) {
    showMessageModal(
      t('criteria_per_judge_no_judges', 'No hay jueces en esta agrupacion.'),
      errorTitle
    );
    return;
  }

  const validation = validateCriteriaPerJudgePairCoverage(
    selectedGroup.criteria,
    selectedGroup.judges,
    criteriaPerJudgeState
  );

  if (!validation.valid) {
    showMessageModal(validation.message, errorTitle);
    return;
  }

  const payload = {
    event_id: getEvent().id,
    competition_ids: Array.from(criteriaPerJudgeState.selectedCompetitionIds).map((competitionId) => {
      const parsed = Number(competitionId);
      return Number.isFinite(parsed) ? parsed : competitionId;
    }),
    pairs: buildCriteriaPerJudgePayloadPairs(validation.pairs)
  };

  const assignButton = document.getElementById('assignCriteriaPerJudgeBtn');
  const originalText = assignButton?.textContent || t('criteria_per_judge_assign_button', 'Asignar');
  if (assignButton) {
    assignButton.disabled = true;
    assignButton.textContent = t('criteria_per_judge_status_saving', 'Guardando...');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/criteria`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showMessageModal(
        data?.error || data?.message || t('criteria_per_judge_request_error', 'Error al asignar criterios por juez.'),
        errorTitle
      );
      return;
    }

    const summaryTemplate = t(
      'criteria_per_judge_success_summary',
      '{message} Competiciones actualizadas: {competitions_updated}. Pares por competicion: {pairs_per_competition}. Creados: {created}. Eliminados: {removed}.'
    );
    const successMessage = summaryTemplate
      .replace('{message}', data?.message || t('criteria_per_judge_ok', 'Todo OK.'))
      .replace('{competitions_updated}', String(data?.competitions_updated ?? payload.competition_ids.length))
      .replace('{pairs_per_competition}', String(data?.pairs_per_competition ?? payload.pairs.length))
      .replace('{created}', String(data?.created ?? '-'))
      .replace('{removed}', String(data?.removed ?? '-'));

    showMessageModal(
      successMessage,
      t('max_times_info_title', 'Information'),
      'success'
    );
    criteriaPerJudgeState.hasPersistedChanges = true;
  } catch (error) {
    showMessageModal(
      error?.message || t('criteria_per_judge_request_error', 'Error al asignar criterios por juez.'),
      errorTitle
    );
  } finally {
    if (assignButton) {
      assignButton.disabled = false;
      assignButton.textContent = originalText;
    }
  }
}

function resetCompetitionCriteriaConfigState() {
  criteriaPerJudgeCompetitionState.competitionId = null;
  criteriaPerJudgeCompetitionState.competition = null;
  criteriaPerJudgeCompetitionState.criteria = [];
  criteriaPerJudgeCompetitionState.judges = [];
  resetCriteriaPerJudgePairAssignments(criteriaPerJudgeCompetitionState);
  criteriaPerJudgeCompetitionState.canEdit = false;
  criteriaPerJudgeCompetitionState.canDelete = false;
  criteriaPerJudgeCompetitionState.loading = false;
}

function syncCompetitionCriteriaConfigModalTitle() {
  const titleEl = document.getElementById('competitionCriteriaConfigModalLabel');
  if (!titleEl) return;

  const baseTitle = t('criteria_per_judge_comp_modal_title', 'Configuracion de criterios por juez');
  const competition = criteriaPerJudgeCompetitionState.competition;
  if (!competition) {
    titleEl.textContent = baseTitle;
    return;
  }

  titleEl.textContent = `${baseTitle} - ${competition.category_name} / ${competition.style_name}`;
}

function updateCompetitionCriteriaConfigActionButtons() {
  const saveBtn = document.getElementById('saveCompetitionCriteriaConfigBtn');
  const deleteBtn = document.getElementById('deleteCompetitionCriteriaConfigBtn');
  const hasCompetition = Boolean(criteriaPerJudgeCompetitionState.competitionId);

  if (saveBtn) {
    const canSave = hasCompetition && criteriaPerJudgeCompetitionState.canEdit && !criteriaPerJudgeCompetitionState.loading;
    saveBtn.disabled = !canSave;
    saveBtn.title = criteriaPerJudgeCompetitionState.canEdit
      ? ''
      : t('criteria_per_judge_comp_modify_only_closed', 'Solo se puede modificar en estado CLOSED.');
  }

  if (deleteBtn) {
    const canDelete = hasCompetition && criteriaPerJudgeCompetitionState.canDelete && !criteriaPerJudgeCompetitionState.loading;
    deleteBtn.disabled = !canDelete;
    deleteBtn.title = criteriaPerJudgeCompetitionState.canDelete
      ? ''
      : t('criteria_per_judge_comp_delete_only_closed_open', 'Solo se puede borrar en estado CLOSED.');
  }
}

function renderCompetitionCriteriaConfigSummary() {
  const panel = document.getElementById('competitionCriteriaConfigSummaryPanel');
  if (!panel) return;

  panel.innerHTML = '';
  syncCompetitionCriteriaConfigModalTitle();

  const competition = criteriaPerJudgeCompetitionState.competition;
  if (!competition) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t(
      'criteria_per_judge_comp_select_prompt',
      'Selecciona una competicion para ver su configuracion.'
    );
    panel.appendChild(empty);
    updateCompetitionCriteriaConfigActionButtons();
    return;
  }

  const competitionName = document.createElement('div');
  competitionName.className = 'fw-semibold mb-2';
  competitionName.textContent = `${competition.category_name} / ${competition.style_name}`;
  panel.appendChild(competitionName);

  const statusRow = document.createElement('div');
  statusRow.className = 'd-flex align-items-center gap-2 mb-3';
  const statusLabel = document.createElement('span');
  statusLabel.className = 'small text-muted';
  statusLabel.textContent = t('col_status', 'Status');
  statusRow.appendChild(statusLabel);
  statusRow.appendChild(createCriteriaPerJudgeCompetitionStatusBadge(competition.status));
  panel.appendChild(statusRow);

  const judgesTitle = document.createElement('div');
  judgesTitle.className = 'fw-semibold mb-2';
  judgesTitle.textContent = t('criteria_per_judge_available_judges', 'Jueces disponibles');
  panel.appendChild(judgesTitle);

  if (!criteriaPerJudgeCompetitionState.judges.length) {
    const noJudges = document.createElement('div');
    noJudges.className = 'small text-muted mb-3';
    noJudges.textContent = t('criteria_per_judge_no_judges', 'No hay jueces en esta agrupacion.');
    panel.appendChild(noJudges);
  } else {
    const judgesWrap = document.createElement('div');
    judgesWrap.className = 'd-flex flex-wrap gap-2 mb-3';
    criteriaPerJudgeCompetitionState.judges.forEach((judge) => {
      const badge = document.createElement('span');
      badge.className = 'badge bg-secondary';
      badge.textContent = judge.name;
      judgesWrap.appendChild(badge);
    });
    panel.appendChild(judgesWrap);
  }

  appendCriteriaPerJudgeBadgeSection(
    panel,
    t('criteria_per_judge_available_criteria', 'Criterios disponibles'),
    criteriaPerJudgeCompetitionState.criteria,
    {
      emptyText: t('criteria_per_judge_no_criteria', 'No hay criterios en esta agrupacion.'),
      formatItem: (criterion) => `${criterion.position}. ${criterion.name}`
    }
  );

  if (!criteriaPerJudgeCompetitionState.canEdit) {
    const editHint = document.createElement('div');
    editHint.className = 'small text-warning mb-2';
    editHint.textContent = t(
      'criteria_per_judge_comp_modify_only_closed',
      'Solo se puede modificar en estado CLOSED.'
    );
    panel.appendChild(editHint);
  }

  if (!criteriaPerJudgeCompetitionState.canDelete) {
    const deleteHint = document.createElement('div');
    deleteHint.className = 'small text-warning';
    deleteHint.textContent = t(
      'criteria_per_judge_comp_delete_only_closed_open',
      'Solo se puede borrar en estado CLOSED.'
    );
    panel.appendChild(deleteHint);
  }

  updateCompetitionCriteriaConfigActionButtons();
}

function renderCompetitionCriteriaConfigMappingPanel() {
  const panel = document.getElementById('competitionCriteriaConfigMappingPanel');
  if (!panel) return;

  panel.innerHTML = '';

  if (!criteriaPerJudgeCompetitionState.competitionId) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t(
      'criteria_per_judge_comp_select_prompt',
      'Selecciona una competicion para ver su configuracion.'
    );
    panel.appendChild(empty);
    updateCompetitionCriteriaConfigActionButtons();
    return;
  }

  if (criteriaPerJudgeCompetitionState.loading) {
    const loading = document.createElement('div');
    loading.className = 'd-flex align-items-center gap-2 text-muted small';
    loading.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>${t('criteria_per_judge_comp_loading', 'Cargando configuracion actual...')}</span>
    `;
    panel.appendChild(loading);
    updateCompetitionCriteriaConfigActionButtons();
    return;
  }

  if (!criteriaPerJudgeCompetitionState.criteria.length) {
    const noCriteria = document.createElement('div');
    noCriteria.className = 'small text-muted';
    noCriteria.textContent = t('criteria_per_judge_no_criteria', 'No hay criterios en esta agrupacion.');
    panel.appendChild(noCriteria);
    updateCompetitionCriteriaConfigActionButtons();
    return;
  }

  if (!criteriaPerJudgeCompetitionState.judges.length) {
    const noJudges = document.createElement('div');
    noJudges.className = 'small text-muted';
    noJudges.textContent = t('criteria_per_judge_no_judges', 'No hay jueces en esta agrupacion.');
    panel.appendChild(noJudges);
    updateCompetitionCriteriaConfigActionButtons();
    return;
  }

  renderCriteriaPerJudgePairEditor(panel, {
    state: criteriaPerJudgeCompetitionState,
    criteria: criteriaPerJudgeCompetitionState.criteria,
    judges: criteriaPerJudgeCompetitionState.judges,
    canEdit: criteriaPerJudgeCompetitionState.canEdit,
    context: 'competition'
  });
  updateCompetitionCriteriaConfigActionButtons();
}

function normalizeCriteriaPerJudgeApiRows(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.data)) return rawData.data;
  if (Array.isArray(rawData?.items)) return rawData.items;
  return [];
}

async function openCompetitionCriteriaConfigModal(competitionId, modalInstance) {
  if (!competitionId || !modalInstance) return;
  if (!competitions.length) {
    await fetchCompetitionsFromAPI();
  }

  const competition = competitions.find(c => String(c.id) === String(competitionId));
  if (!competition) {
    showMessageModal(
      t('criteria_per_judge_comp_not_found', 'Competicion no encontrada.'),
      t('error_title', 'Error')
    );
    return;
  }

  resetCompetitionCriteriaConfigState();
  criteriaPerJudgeCompetitionState.competitionId = String(competition.id);
  criteriaPerJudgeCompetitionState.competition = competition;
  criteriaPerJudgeCompetitionState.criteria = normalizeCriteriaPerJudgeCriteria(competition.criteria);
  criteriaPerJudgeCompetitionState.judges = normalizeCriteriaPerJudgeJudges(competition.judges);
  const normalizedStatus = String(competition.status || '').toUpperCase();
  criteriaPerJudgeCompetitionState.canEdit = normalizedStatus === 'CLO';
  criteriaPerJudgeCompetitionState.canDelete = CRITERIA_PER_JUDGE_DELETE_ALLOWED_STATUSES.has(normalizedStatus);
  criteriaPerJudgeCompetitionState.loading = true;

  renderCompetitionCriteriaConfigSummary();
  renderCompetitionCriteriaConfigMappingPanel();
  modalInstance.show();

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/${competition.id}/criteria-judge`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || t('criteria_per_judge_comp_fetch_error', 'Error al cargar la configuracion actual.')
      );
    }

    const rows = normalizeCriteriaPerJudgeApiRows(data);
    setCriteriaPerJudgePairAssignments(
      criteriaPerJudgeCompetitionState,
      rows,
      criteriaPerJudgeCompetitionState.criteria,
      criteriaPerJudgeCompetitionState.judges
    );
  } catch (error) {
    showMessageModal(
      error?.message || t('criteria_per_judge_comp_fetch_error', 'Error al cargar la configuracion actual.'),
      t('error_title', 'Error')
    );
  } finally {
    criteriaPerJudgeCompetitionState.loading = false;
    renderCompetitionCriteriaConfigSummary();
    renderCompetitionCriteriaConfigMappingPanel();
  }
}

function handleCompetitionCriteriaPerJudgeSelectionChange(selectEl) {
  handleCriteriaPerJudgePairSelectionChange(selectEl, criteriaPerJudgeCompetitionState);
}

async function handleCompetitionCriteriaConfigSave() {
  const errorTitle = t('error_title', 'Error');
  if (!criteriaPerJudgeCompetitionState.competitionId) {
    showMessageModal(
      t('criteria_per_judge_comp_select_prompt', 'Selecciona una competicion para ver su configuracion.'),
      errorTitle
    );
    return;
  }

  if (!criteriaPerJudgeCompetitionState.canEdit) {
    showMessageModal(
      t('criteria_per_judge_comp_modify_only_closed', 'Solo se puede modificar en estado CLOSED.'),
      errorTitle
    );
    return;
  }

  if (!criteriaPerJudgeCompetitionState.criteria.length) {
    showMessageModal(
      t('criteria_per_judge_no_criteria', 'No hay criterios en esta agrupacion.'),
      errorTitle
    );
    return;
  }

  if (!criteriaPerJudgeCompetitionState.judges.length) {
    showMessageModal(
      t('criteria_per_judge_no_judges', 'No hay jueces en esta agrupacion.'),
      errorTitle
    );
    return;
  }

  const validation = validateCriteriaPerJudgePairCoverage(
    criteriaPerJudgeCompetitionState.criteria,
    criteriaPerJudgeCompetitionState.judges,
    criteriaPerJudgeCompetitionState
  );
  if (!validation.valid) {
    showMessageModal(validation.message, errorTitle);
    return;
  }

  const parsedCompetitionId = Number(criteriaPerJudgeCompetitionState.competitionId);
  const payload = {
    event_id: getEvent().id,
    competition_ids: [
      Number.isFinite(parsedCompetitionId)
        ? parsedCompetitionId
        : criteriaPerJudgeCompetitionState.competitionId
    ],
    pairs: buildCriteriaPerJudgePayloadPairs(validation.pairs)
  };

  const saveButton = document.getElementById('saveCompetitionCriteriaConfigBtn');
  const originalText = saveButton?.textContent || t('criteria_per_judge_comp_save_button', 'Guardar');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = t('criteria_per_judge_status_saving', 'Guardando...');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/criteria`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showMessageModal(
        data?.error || data?.message || t('criteria_per_judge_request_error', 'Error al asignar criterios por juez.'),
        errorTitle
      );
      return;
    }

    const summaryTemplate = t(
      'criteria_per_judge_success_summary',
      '{message} Competiciones actualizadas: {competitions_updated}. Pares por competicion: {pairs_per_competition}. Creados: {created}. Eliminados: {removed}.'
    );
    const successMessage = summaryTemplate
      .replace('{message}', data?.message || t('criteria_per_judge_ok', 'Todo OK.'))
      .replace('{competitions_updated}', String(data?.competitions_updated ?? payload.competition_ids.length))
      .replace('{pairs_per_competition}', String(data?.pairs_per_competition ?? payload.pairs.length))
      .replace('{created}', String(data?.created ?? '-'))
      .replace('{removed}', String(data?.removed ?? '-'));

    showMessageModal(
      successMessage,
      t('max_times_info_title', 'Information'),
      'success'
    );

    await fetchCompetitionsFromAPI();
    const updatedCompetition = competitions.find(c => String(c.id) === String(criteriaPerJudgeCompetitionState.competitionId));
    if (updatedCompetition) {
      criteriaPerJudgeCompetitionState.competition = updatedCompetition;
      criteriaPerJudgeCompetitionState.criteria = normalizeCriteriaPerJudgeCriteria(updatedCompetition.criteria);
      criteriaPerJudgeCompetitionState.judges = normalizeCriteriaPerJudgeJudges(updatedCompetition.judges);
      const normalizedStatus = String(updatedCompetition.status || '').toUpperCase();
      criteriaPerJudgeCompetitionState.canEdit = normalizedStatus === 'CLO';
      criteriaPerJudgeCompetitionState.canDelete = CRITERIA_PER_JUDGE_DELETE_ALLOWED_STATUSES.has(normalizedStatus);
      renderCompetitionCriteriaConfigSummary();
      renderCompetitionCriteriaConfigMappingPanel();
    }
  } catch (error) {
    showMessageModal(
      error?.message || t('criteria_per_judge_request_error', 'Error al asignar criterios por juez.'),
      errorTitle
    );
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }
    updateCompetitionCriteriaConfigActionButtons();
  }
}

function handleCompetitionCriteriaConfigDelete() {
  const infoTitle = t('max_times_info_title', 'Information');
  const errorTitle = t('error_title', 'Error');
  if (!criteriaPerJudgeCompetitionState.competitionId) {
    showMessageModal(
      t('criteria_per_judge_comp_select_prompt', 'Selecciona una competicion para ver su configuracion.'),
      infoTitle,
      'warning'
    );
    return;
  }

  if (!criteriaPerJudgeCompetitionState.canDelete) {
    showMessageModal(
      t('criteria_per_judge_comp_delete_only_closed_open', 'Solo se puede borrar en estado CLOSED.'),
      infoTitle,
      'warning'
    );
    return;
  }

  const deleteButton = document.getElementById('deleteCompetitionCriteriaConfigBtn');
  const originalText = deleteButton?.textContent || t('criteria_per_judge_comp_delete_button', 'Borrar asignaciones');
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.textContent = t('criteria_per_judge_comp_status_deleting', 'Borrando...');
  }

  const parsedCompetitionId = Number(criteriaPerJudgeCompetitionState.competitionId);
  const payload = {
    event_id: getEvent().id,
    competition_id: Number.isFinite(parsedCompetitionId)
      ? parsedCompetitionId
      : criteriaPerJudgeCompetitionState.competitionId
  };

  fetch(`${API_BASE_URL}/api/competitions/${criteriaPerJudgeCompetitionState.competitionId}/criteria-judge`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || t('criteria_per_judge_comp_delete_error', 'Error al borrar asignaciones de criterios por juez.')
        );
      }

      resetCriteriaPerJudgePairAssignments(criteriaPerJudgeCompetitionState);
      renderCompetitionCriteriaConfigMappingPanel();

      const removed = data?.removed;
      const baseMessage = data?.message || t(
        'criteria_per_judge_comp_delete_success',
        'Asignaciones borradas correctamente.'
      );
      const successMessage = Number.isFinite(Number(removed))
        ? `${baseMessage} (${String(removed)}).`
        : baseMessage;

      showMessageModal(successMessage, infoTitle, 'success');

      await fetchCompetitionsFromAPI();
      const updatedCompetition = competitions.find(c => String(c.id) === String(criteriaPerJudgeCompetitionState.competitionId));
      if (updatedCompetition) {
        criteriaPerJudgeCompetitionState.competition = updatedCompetition;
        criteriaPerJudgeCompetitionState.criteria = normalizeCriteriaPerJudgeCriteria(updatedCompetition.criteria);
        criteriaPerJudgeCompetitionState.judges = normalizeCriteriaPerJudgeJudges(updatedCompetition.judges);
        const normalizedStatus = String(updatedCompetition.status || '').toUpperCase();
        criteriaPerJudgeCompetitionState.canEdit = normalizedStatus === 'CLO';
        criteriaPerJudgeCompetitionState.canDelete = CRITERIA_PER_JUDGE_DELETE_ALLOWED_STATUSES.has(normalizedStatus);
        renderCompetitionCriteriaConfigSummary();
        renderCompetitionCriteriaConfigMappingPanel();
      }
    })
    .catch((error) => {
      showMessageModal(
        error?.message || t('criteria_per_judge_comp_delete_error', 'Error al borrar asignaciones de criterios por juez.'),
        errorTitle
      );
    })
    .finally(() => {
      if (deleteButton) {
        deleteButton.disabled = false;
        deleteButton.textContent = originalText;
      }
      updateCompetitionCriteriaConfigActionButtons();
    });
}

function renderMaxTimesSelectionListFromSelect(selectId, targetId, type) {
  const targetList = document.getElementById(targetId);
  if (!targetList) return;

  targetList.innerHTML = '';

  let options = [];
  const sourceSelect = document.getElementById(selectId);
  if (sourceSelect) {
    options = Array.from(sourceSelect.options)
      .filter(opt => !opt.disabled && String(opt.value || '').trim() !== '')
      .map(opt => ({ value: String(opt.value), label: opt.textContent || opt.label || String(opt.value) }));
  } else {
    const catalog = type === 'category' ? categoriesCatalog : stylesCatalog;
    options = catalog.map(item => ({ value: String(item.value), label: item.label }));
  }

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('max_times_no_items', 'No hay elementos disponibles.');
    targetList.appendChild(empty);
    return;
  }

  options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'list-group-item d-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input max-times-option';
    checkbox.dataset.type = type;
    checkbox.value = option.value;
    checkbox.id = `max-times-${type}-${index}`;

    const text = document.createElement('span');
    text.textContent = option.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    targetList.appendChild(label);
  });
}

function renderMaxTimesSelectionLists() {
  renderMaxTimesSelectionListFromSelect('categoryDropdown', 'maxTimesCategoriesList', 'category');
  renderMaxTimesSelectionListFromSelect('styleDropdown', 'maxTimesStylesList', 'style');
}

function getMaxTimesSelectAllElement(type) {
  if (type === 'category') return document.getElementById('maxTimesSelectAllCategories');
  if (type === 'style') return document.getElementById('maxTimesSelectAllStyles');
  return null;
}

function setMaxTimesOptionsChecked(type, checked) {
  const options = document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]`);
  options.forEach(input => {
    input.checked = Boolean(checked);
  });
}

function updateMaxTimesSelectAllState(type) {
  const selectAllEl = getMaxTimesSelectAllElement(type);
  if (!selectAllEl) return;

  const allOptions = Array.from(document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]`));
  if (!allOptions.length) {
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
    return;
  }

  const checkedCount = allOptions.filter(input => input.checked).length;
  selectAllEl.checked = checkedCount === allOptions.length;
  selectAllEl.indeterminate = checkedCount > 0 && checkedCount < allOptions.length;
}

function getSelectedMaxTimesValues(type) {
  return Array.from(document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]:checked`))
    .map(input => input.value);
}

function updateMaxTimesSelectionSummary() {
  const summaryEl = document.getElementById('maxTimesSelectionSummary');
  if (!summaryEl) return;

  const categoriesCount = getSelectedMaxTimesValues('category').length;
  const stylesCount = getSelectedMaxTimesValues('style').length;
  const summaryTemplate = t(
    'max_times_summary',
    '{categories} category(ies) selected · {styles} style(s) selected'
  );
  const summaryText = summaryTemplate
    .replace('{categories}', String(categoriesCount))
    .replace('{styles}', String(stylesCount));

  const categoryBadge = summaryEl.querySelector('[data-role="max-times-categories"]');
  const styleBadge = summaryEl.querySelector('[data-role="max-times-styles"]');
  if (categoryBadge) {
    categoryBadge.textContent = t('max_times_summary_categories', '{count} categories')
      .replace('{count}', String(categoriesCount));
  }
  if (styleBadge) {
    styleBadge.textContent = t('max_times_summary_styles', '{count} styles')
      .replace('{count}', String(stylesCount));
  }
  summaryEl.setAttribute('aria-label', summaryText);
  summaryEl.classList.remove('d-none');
}

function normalizeMaxTimeValue(rawValue) {
  const match = String(rawValue || '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function maxTimeToSeconds(normalizedValue) {
  if (!normalizedValue) return null;

  const [minutesPart, secondsPart] = String(normalizedValue).split(':');
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return (minutes * 60) + seconds;
}

function maxTimeSecondsToNormalized(totalSeconds) {
  const parsedSeconds = Number(totalSeconds);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds < 0) return null;

  const minutes = Math.floor(parsedSeconds / 60);
  const seconds = parsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCompetitionMaxTimeSeconds(competition) {
  if (!competition) return null;

  const maxTimeAsNumber = Number(competition.max_time ?? competition.maxTime);
  if (Number.isFinite(maxTimeAsNumber) && maxTimeAsNumber >= 0) {
    return maxTimeAsNumber;
  }

  const maxTimeAsText = competition.max_time_form || competition.max_time_text || competition.max_time_display;
  const normalizedMaxTime = normalizeMaxTimeValue(maxTimeAsText);
  const parsedSeconds = maxTimeToSeconds(normalizedMaxTime);
  return Number.isFinite(parsedSeconds) ? parsedSeconds : null;
}

function getSelectOptionLabel(selectId, value) {
  const selectEl = document.getElementById(selectId);
  if (selectEl) {
    const option = Array.from(selectEl.options).find(opt => String(opt.value) === String(value));
    if (option) {
      return option.textContent || option.label || String(value);
    }
  }

  if (selectId === 'categoryDropdown') {
    const item = categoriesCatalog.find(cat => String(cat.value) === String(value));
    if (item) return item.label;
  }

  if (selectId === 'styleDropdown') {
    const item = stylesCatalog.find(style => String(style.value) === String(value));
    if (item) return item.label;
  }

  return String(value);
}

async function ensureCreateCompsSourceOptionsLoaded() {
  const categorySelect = document.getElementById('categoryDropdown');
  const categoriesLoaded = categoriesCatalog.length > 0 || (categorySelect && categorySelect.options.length > 0);
  if (!categoriesLoaded) {
    await loadCategories();
  }

  const styleSelect = document.getElementById('styleDropdown');
  const stylesLoaded = stylesCatalog.length > 0 || (styleSelect && styleSelect.options.length > 0);
  if (!stylesLoaded) {
    await loadStyles();
  }
}

function renderCreateCompsSelectionListFromSelect(selectId, targetId, type) {
  const targetList = document.getElementById(targetId);
  if (!targetList) return;

  targetList.innerHTML = '';

  let options = [];
  const sourceSelect = document.getElementById(selectId);
  if (sourceSelect) {
    options = Array.from(sourceSelect.options)
      .filter(opt => !opt.disabled && String(opt.value || '').trim() !== '')
      .map(opt => ({ value: String(opt.value), label: opt.textContent || opt.label || String(opt.value) }));
  } else {
    const catalog = type === 'category' ? categoriesCatalog : stylesCatalog;
    options = catalog.map(item => ({ value: String(item.value), label: item.label }));
  }

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('create_competitions_no_items', 'No items available.');
    targetList.appendChild(empty);
    return;
  }

  options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'list-group-item d-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input create-comps-option';
    checkbox.dataset.type = type;
    checkbox.value = option.value;
    checkbox.id = `create-comps-${type}-${index}`;

    const text = document.createElement('span');
    text.textContent = option.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    targetList.appendChild(label);
  });
}

function renderCreateCompetitionsSelectionLists() {
  renderCreateCompsSelectionListFromSelect('categoryDropdown', 'createCompsCategoriesList', 'category');
  renderCreateCompsSelectionListFromSelect('styleDropdown', 'createCompsStylesList', 'style');
}

function getCreateCompsSelectAllElement(type) {
  if (type === 'category') return document.getElementById('createCompsSelectAllCategories');
  if (type === 'style') return document.getElementById('createCompsSelectAllStyles');
  return null;
}

function setCreateCompsOptionsChecked(type, checked) {
  const options = document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]`);
  options.forEach(input => {
    input.checked = Boolean(checked);
  });
}

function updateCreateCompsSelectAllState(type) {
  const selectAllEl = getCreateCompsSelectAllElement(type);
  if (!selectAllEl) return;

  const allOptions = Array.from(document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]`));
  if (!allOptions.length) {
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
    return;
  }

  const checkedCount = allOptions.filter(input => input.checked).length;
  selectAllEl.checked = checkedCount === allOptions.length;
  selectAllEl.indeterminate = checkedCount > 0 && checkedCount < allOptions.length;
}

function getSelectedCreateCompsValues(type) {
  return Array.from(document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]:checked`))
    .map(input => input.value);
}

function updateCreateCompsSelectionSummary() {
  const summaryEl = document.getElementById('createCompsSelectionSummary');
  if (!summaryEl) return;

  const categoriesCount = getSelectedCreateCompsValues('category').length;
  const stylesCount = getSelectedCreateCompsValues('style').length;
  const summaryTemplate = t(
    'create_competitions_summary_selection',
    'Selected: {categories} category(ies), {styles} style(s).'
  );
  summaryEl.textContent = summaryTemplate
    .replace('{categories}', String(categoriesCount))
    .replace('{styles}', String(stylesCount));
}

function clearCreateCompsResultPanel() {
  const panelEl = document.getElementById('createCompsResultPanel');
  const summaryEl = document.getElementById('createCompsResultSummary');
  const listEl = document.getElementById('createCompsResultList');

  if (panelEl) panelEl.classList.add('d-none');
  if (summaryEl) summaryEl.textContent = '';
  if (listEl) listEl.innerHTML = '';
}

function renderCreateCompsResults(results) {
  const panelEl = document.getElementById('createCompsResultPanel');
  const summaryEl = document.getElementById('createCompsResultSummary');
  const listEl = document.getElementById('createCompsResultList');
  if (!panelEl || !summaryEl || !listEl) return;

  const okCount = results.filter(item => String(item?.status || '').toUpperCase() === 'OK').length;
  const skipCount = results.filter(item => String(item?.status || '').toUpperCase() === 'SKIP').length;
  const errorCount = results.filter(item => String(item?.status || '').toUpperCase() === 'KO').length;
  const summaryTemplate = t(
    'create_competitions_results_summary',
    'Total: {total} | OK: {ok} | Skip: {skip} | Error: {error}'
  );
  summaryEl.innerHTML = summaryTemplate
    .replace('{total}', `<strong>${results.length}</strong>`)
    .replace('{ok}', `<span class="text-success"><strong>${okCount}</strong></span>`)
    .replace('{skip}', `<span class="text-warning"><strong>${skipCount}</strong></span>`)
    .replace('{error}', `<span class="text-danger"><strong>${errorCount}</strong></span>`);

  listEl.innerHTML = '';
  results.forEach((result) => {
    const normalizedStatus = String(result?.status || '').toUpperCase();
    const resultStatus = normalizedStatus === 'OK' || normalizedStatus === 'KO' || normalizedStatus === 'SKIP'
      ? normalizedStatus
      : (result.ok ? 'OK' : 'KO');
    const statusTextClass = resultStatus === 'OK'
      ? 'text-success'
      : (resultStatus === 'SKIP' ? 'text-warning' : 'text-danger');
    const statusBadgeClass = resultStatus === 'OK'
      ? 'bg-success'
      : (resultStatus === 'SKIP' ? 'bg-warning text-dark' : 'bg-danger');

    const row = document.createElement('div');
    row.className = 'list-group-item d-flex align-items-start justify-content-between gap-3';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'fw-semibold';
    title.textContent = `${result.categoryName} / ${result.styleName}`;
    const message = document.createElement('div');
    message.className = `small ${statusTextClass}`;
    message.textContent = result.message || (resultStatus === 'OK'
      ? t('create_competitions_result_ok', 'Created')
      : (resultStatus === 'SKIP'
        ? t('create_competitions_result_skip', 'Skipped')
        : t('create_competitions_result_error', 'Error')));

    left.appendChild(title);
    left.appendChild(message);

    const badge = document.createElement('span');
    badge.className = `badge ${statusBadgeClass}`;
    badge.textContent = resultStatus;

    row.appendChild(left);
    row.appendChild(badge);
    listEl.appendChild(row);
  });

  panelEl.classList.remove('d-none');
}

function setAssignmentResult(compId, status, message) {
  const resultEl = document.querySelector(`#competitionsAssignmentList input[data-comp-id="${compId}"]`)
    ?.closest('.list-group-item')
    ?.querySelector('[data-result]');

  if (!resultEl) return;

  resultEl.classList.remove('text-muted', 'text-success', 'text-danger', 'text-warning');

  if (status === 'updating') {
    resultEl.textContent = t('judges_assignment_status_updating');
    resultEl.classList.add('text-warning');
    return;
  }

  if (status === 'ok') {
    resultEl.textContent = t('judges_assignment_status_ok');
    resultEl.classList.add('text-success');
    return;
  }

  if (status === 'error') {
    const errorPrefix = t('judges_assignment_status_error');
    resultEl.textContent = message ? `${errorPrefix}: ${message}` : errorPrefix;
    resultEl.classList.add('text-danger');
    return;
  }

  resultEl.textContent = t('judges_assignment_status_pending');
  resultEl.classList.add('text-muted');
}

async function updateCompetitionJudgesAssignment(competition, judgeIds, headJudgeId = null) {
  if (!competition) return;

  setAssignmentResult(competition.id, 'updating');

  const reserveJudge = shouldShowReserveJudgeField()
    ? (competition.judges || []).find(j => isJudgeFlagEnabled(j.reserve))
    : null;
  const reserveId = reserveJudge ? String(reserveJudge.id) : null;
  const reserveToSend = reserveId && judgeIds.includes(reserveId) ? reserveId : null;

  const competitionData = {
    category_id: competition.category_id,
    style_id: competition.style_id,
    estimated_start: toDatetimeLocalFormat(competition.estimated_start_form),
    status: competition.status,
    judges: judgeIds,
    judge_reserve: reserveToSend,
    max_time: getCompetitionMaxTimeSeconds(competition),
    event_id: getEvent().id
  };

  if (shouldShowHeadJudgeField()) {
    const normalizedHeadId = headJudgeId ? String(headJudgeId) : null;
    const headToSend = normalizedHeadId && judgeIds.includes(normalizedHeadId) ? normalizedHeadId : null;
    competitionData.judge_head = headToSend;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/${competition.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(competitionData)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAssignmentResult(competition.id, 'error', data?.error || 'Error saving competition');
      return;
    }

    setAssignmentResult(competition.id, 'ok');
  } catch (error) {
    console.error('Error updating competition judges:', error);
    setAssignmentResult(competition.id, 'error', error?.message || 'Unexpected error');
  }
}



