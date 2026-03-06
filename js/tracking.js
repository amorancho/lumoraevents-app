var title = 'Competition Tracking';

const allowedRoles = ["admin", "organizer"];
const voteDetailsInFlight = new Set();
const competitionDetailsInFlight = new Set();
const SIDEBAR_STATUS_FILTER_NOT_FINISHED = '__NOT_FINISHED__';
const TRACKING_SIDEBAR_FILTERS_STORAGE_PREFIX = 'lumora.tracking.sidebarFilters';
const LIVE_TRACKING_POLL_INTERVAL_MS = 30000;
const classificationExportState = {
  options: [],
  mode: 'ALL',
  categoryIds: []
};
const trackingUiState = {
  selectedCategoryId: null,
  selectedStyleId: null,
  selectedCompetitionId: null,
  selectedCompetitionRevision: null,
  sidebarCompetitions: [],
  sidebarFilters: {
    category: '',
    style: '',
    status: ''
  }
};
const liveTrackingState = {
  intervalId: null,
  competitionId: null,
  isPolling: false
};
const penaltyAssignmentState = {
  context: null,
  penalties: [],
  competitionPenalties: []
};

updateElementProperty('backToDashboardBtn', 'href', `dashboard.html?eventId=${encodeURIComponent(eventId)}`);

function getTrackingSidebarFiltersStorageKey() {
  const eventId = typeof getEvent === 'function' ? (getEvent()?.id ?? 'no_event') : 'no_event';
  const userId = typeof getUserId === 'function' ? (getUserId() ?? 'no_user') : 'no_user';
  return `${TRACKING_SIDEBAR_FILTERS_STORAGE_PREFIX}:${eventId}:${userId}`;
}

function normalizeTrackingSidebarFilters(filters) {
  return {
    category: typeof filters?.category === 'string' ? filters.category : '',
    style: typeof filters?.style === 'string' ? filters.style : '',
    status: typeof filters?.status === 'string' ? filters.status : ''
  };
}

function loadTrackingSidebarFilters() {
  try {
    const raw = localStorage.getItem(getTrackingSidebarFiltersStorageKey());
    if (!raw) return normalizeTrackingSidebarFilters({});

    const parsed = JSON.parse(raw);
    return normalizeTrackingSidebarFilters(parsed);
  } catch {
    return normalizeTrackingSidebarFilters({});
  }
}

function saveTrackingSidebarFilters(filters = trackingUiState.sidebarFilters) {
  try {
    const normalized = normalizeTrackingSidebarFilters(filters);
    localStorage.setItem(getTrackingSidebarFiltersStorageKey(), JSON.stringify(normalized));
  } catch {
    // ignore
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseClassificationVisible(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function getClassificationVisibilityText(isVisible) {
  return isVisible
    ? t('classification_visibility_state_visible', 'La clasificación es visible')
    : t('classification_visibility_state_hidden', 'La clasificación no es visible');
}

function parseJudgeFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function normalizeCompetitionRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCompetitionRevision(payload) {
  if (payload === null || payload === undefined) return null;

  const directRevision = normalizeCompetitionRevision(payload);
  if (directRevision !== null) return directRevision;

  if (typeof payload !== 'object') return null;

  const candidates = [
    payload.revision,
    payload.competition_revision,
    payload.competitionRevision,
    payload.data?.revision,
    payload.data?.competition_revision,
    payload.data?.competitionRevision
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCompetitionRevision(candidate);
    if (normalized !== null) return normalized;
  }

  return null;
}

function normalizeClassificationExportOptions(payload) {
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const seenCategoryIds = new Set();

  return categories.reduce((acc, entry) => {
    const rawCategoryId = entry?.category?.id ?? entry?.general?.category_id;
    const categoryId = Number(rawCategoryId);

    if (!Number.isFinite(categoryId) || seenCategoryIds.has(categoryId)) {
      return acc;
    }

    seenCategoryIds.add(categoryId);

    const categoryName = entry?.category?.name
      || entry?.general?.category_name
      || `${t('category')} ${categoryId}`;

    acc.push({
      id: categoryId,
      name: categoryName,
      stylesCount: Array.isArray(entry?.styles) ? entry.styles.length : 0
    });

    return acc;
  }, []);
}

function renderClassificationExportOptions(categories) {
  const modalBody = document.getElementById('classificationExportOptionsBody');
  if (!modalBody) return;

  const categoriesCount = categories.length;
  const categoryRows = categories.map((category, index) => {
    const inputId = `export-category-option-${category.id}-${index}`;
    return `
      <div class="form-check mb-2">
        <input class="form-check-input js-export-category-option" type="checkbox" value="${category.id}" id="${inputId}">
        <label class="form-check-label" for="${inputId}">
          ${escapeHtml(category.name)}
          <span class="text-muted ms-1">(${category.stylesCount} ${escapeHtml(t('style'))})</span>
        </label>
      </div>
    `;
  }).join('');

  modalBody.innerHTML = `
    <div class="mb-3">
      <div class="form-check">
        <input class="form-check-input js-export-scope-option" type="radio" name="classificationExportScope" id="exportScopeAll" value="ALL" checked>
        <label class="form-check-label" for="exportScopeAll">${escapeHtml(t('export_modal_scope_all', 'All'))}</label>
      </div>
      <div class="form-check">
        <input class="form-check-input js-export-scope-option" type="radio" name="classificationExportScope" id="exportScopeCategories" value="CATEGORIES">
        <label class="form-check-label" for="exportScopeCategories">${escapeHtml(t('export_modal_scope_categories', 'Select categories'))}</label>
      </div>
    </div>
    <div id="exportCategoriesWrapper" class="d-none">
      <p class="fw-semibold mb-2">
        ${escapeHtml(t('export_modal_available_categories', 'Available categories'))}
        (${categoriesCount})
      </p>
      <div class="border rounded p-3 export-categories-list">
        ${categoryRows}
      </div>
    </div>
    <div id="exportSelectionValidation" class="alert alert-warning py-2 mt-3 mb-0 d-none"></div>
    <small class="text-muted d-block mt-3" id="exportSelectionHint"></small>
  `;

  const scopeInputs = Array.from(modalBody.querySelectorAll('.js-export-scope-option'));
  const categoryInputs = Array.from(modalBody.querySelectorAll('.js-export-category-option'));
  const categoriesWrapper = modalBody.querySelector('#exportCategoriesWrapper');
  const selectionHint = modalBody.querySelector('#exportSelectionHint');
  const validationEl = modalBody.querySelector('#exportSelectionValidation');
  const confirmBtn = document.getElementById('classificationExportConfirmBtn');

  const clearValidation = () => {
    if (!validationEl) return;
    validationEl.textContent = '';
    validationEl.classList.add('d-none');
  };

  const syncSelectionState = () => {
    const selectedScope = scopeInputs.find(input => input.checked)?.value || 'ALL';
    const isByCategory = selectedScope === 'CATEGORIES';

    classificationExportState.mode = selectedScope;
    if (categoriesWrapper) {
      categoriesWrapper.classList.toggle('d-none', !isByCategory);
    }

    categoryInputs.forEach(input => {
      input.disabled = !isByCategory;
      if (!isByCategory) {
        input.checked = false;
      }
    });

    classificationExportState.categoryIds = isByCategory
      ? categoryInputs
        .filter(input => input.checked)
        .map(input => Number(input.value))
        .filter(value => Number.isFinite(value))
      : [];

    if (confirmBtn) {
      confirmBtn.disabled = isByCategory && classificationExportState.categoryIds.length === 0;
    }

    if (selectionHint) {
      selectionHint.textContent = isByCategory
        ? `${classificationExportState.categoryIds.length}/${categoriesCount} ${t('export_modal_categories_selected', 'categories selected')}`
        : t('export_modal_all_selected', 'Selected: all categories');
    }

    clearValidation();
  };

  scopeInputs.forEach(input => input.addEventListener('change', syncSelectionState));
  categoryInputs.forEach(input => input.addEventListener('change', syncSelectionState));
  syncSelectionState();
}

function setButtonLoading(button, isLoading, loadingText = t('loading')) {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(loadingText)}</span>
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

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'results-export.pdf';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportClassificationResults(eventId, { all = true, categories = [] } = {}) {
  if (!eventId) {
    throw new Error(t('error_title'));
  }

  const normalizedCategories = Array.isArray(categories)
    ? categories
      .map(value => Number(value))
      .filter(value => Number.isFinite(value))
    : [];

  const response = await fetch(`${API_BASE_URL}/api/competitions/results/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      all: Boolean(all),
      categories: all ? [] : normalizedCategories
    })
  });

  if (!response.ok) {
    let message = t('error_title');
    try {
      const data = await response.json();
      message = data?.error || data?.message || message;
    } catch {
      // ignore non-json errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition');
  const filename = getFilenameFromContentDisposition(disposition) || `results-event-${eventId}.pdf`;

  downloadBlobFile(blob, filename);
}

function initClassificationExportOptions() {
  const exportBtn = document.getElementById('exportBtn');
  const modalEl = document.getElementById('classificationExportOptionsModal');
  const modalBody = document.getElementById('classificationExportOptionsBody');
  const confirmBtn = document.getElementById('classificationExportConfirmBtn');

  if (!exportBtn || !modalEl || !modalBody || !confirmBtn) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  confirmBtn.disabled = true;

  exportBtn.addEventListener('click', async () => {
    if (exportBtn.disabled) return;

    const originalContent = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ${t('loading')}
    `;

    modalBody.innerHTML = `
      <div class="d-flex align-items-center justify-content-center py-4">
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>${t('loading')}</span>
      </div>
    `;
    confirmBtn.disabled = true;

    modal.show();

    try {
      const eventId = getEvent()?.id;
      if (!eventId) {
        throw new Error(t('error_title'));
      }

      const response = await fetch(`${API_BASE_URL}/api/competitions/classification-export-options?event_id=${eventId}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || t('error_title'));
      }

      const categories = normalizeClassificationExportOptions(payload);

      classificationExportState.options = categories;
      classificationExportState.mode = 'ALL';
      classificationExportState.categoryIds = [];

      if (!categories.length) {
        modalBody.innerHTML = `
          <div class="alert alert-info mb-0">
            ${escapeHtml(t('export_modal_no_options', 'No classification results are available to export.'))}
          </div>
        `;
        confirmBtn.disabled = true;
        return;
      }

      renderClassificationExportOptions(categories);
      confirmBtn.disabled = false;
    } catch (error) {
      console.error('Error loading classification export options:', error);
      classificationExportState.options = [];
      classificationExportState.mode = 'ALL';
      classificationExportState.categoryIds = [];

      modalBody.innerHTML = `
        <div class="alert alert-danger mb-0">
          ${escapeHtml(error?.message || t('error_title'))}
        </div>
      `;
      confirmBtn.disabled = true;
    } finally {
      exportBtn.innerHTML = originalContent;
      exportBtn.disabled = false;
    }
  });

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;

    const eventId = getEvent()?.id;
    if (!eventId) {
      showMessageModal(t('error_title'), t('error_title'));
      return;
    }

    const validationEl = modalBody.querySelector('#exportSelectionValidation');
    const all = classificationExportState.mode === 'ALL';
    const categories = all ? [] : [...classificationExportState.categoryIds];

    if (!all && categories.length === 0) {
      if (validationEl) {
        validationEl.textContent = t('export_modal_select_category_validation', 'Select at least one category to export.');
        validationEl.classList.remove('d-none');
      }
      return;
    }

    if (validationEl) {
      validationEl.textContent = '';
      validationEl.classList.add('d-none');
    }

    setButtonLoading(confirmBtn, true, t('exporting', 'Exporting...'));
    try {
      await exportClassificationResults(eventId, { all, categories });
      modal.hide();
    } catch (error) {
      console.error('Error exporting results:', error);
      showMessageModal(error?.message || t('error_title'), t('error_title'));
    } finally {
      setButtonLoading(confirmBtn, false);
    }
  });
}

function getClassificationExportSelection() {
  return {
    mode: classificationExportState.mode,
    categoryIds: [...classificationExportState.categoryIds]
  };
}

window.getClassificationExportSelection = getClassificationExportSelection;

function getCompetitionJudges(competition) {
  const directJudges = Array.isArray(competition?.judges) ? competition.judges.filter(Boolean) : [];
  if (directJudges.length) return directJudges;

  const judgesById = new Map();
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  dancers.forEach(dancer => {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    votes.forEach(vote => {
      const judge = vote?.judge;
      if (!judge || judge.id === undefined || judge.id === null) return;
      judgesById.set(String(judge.id), judge);
    });
  });

  return Array.from(judgesById.values());
}

function getCompetitionCriteria(competition, judges) {
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  for (const dancer of dancers) {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    for (const judge of judges) {
      const vote = votes.find(v => String(v?.judge?.id) === String(judge?.id));
      const details = Array.isArray(vote?.details) ? vote.details : [];
      if (!details.length) continue;

      return details.map(detail => ({
        criteria_id: detail?.criteria_id,
        criteria_name: detail?.criteria_name || '',
        percentage: detail?.percentage
      }));
    }
  }
  return [];
}

function findVoteDetailByCriteria(vote, criteriaRef) {
  const details = Array.isArray(vote?.details) ? vote.details : [];
  if (!details.length) return null;

  const byId = details.find(detail =>
    criteriaRef?.criteria_id !== undefined &&
    criteriaRef?.criteria_id !== null &&
    detail?.criteria_id === criteriaRef.criteria_id
  );
  if (byId) return byId;

  return details.find(detail => String(detail?.criteria_name || '') === String(criteriaRef?.criteria_name || '')) || null;
}

function formatVoteScore(score) {
  if (score === null || score === undefined || score === '') {
    return '-';
  }

  const numericValue = Number(score);
  if (Number.isFinite(numericValue) && (numericValue === 0 || numericValue === -1)) {
    return '-';
  }

  return escapeHtml(score);
}

function parseCriterionScore(score) {
  if (score === null || score === undefined || score === '') {
    return null;
  }

  const numericValue = Number(score);
  if (!Number.isFinite(numericValue) || numericValue === -1 || numericValue === 0) {
    return null;
  }

  return numericValue;
}

function formatVoteTotalScore(score) {
  if (score === null || score === undefined || score === '') {
    return '-';
  }

  const numericValue = Number(score);
  if (!Number.isFinite(numericValue)) {
    return escapeHtml(score);
  }
  if (numericValue === -1) {
    return '-';
  }

  return escapeHtml(formatResultScore(numericValue));
}

function formatCriteriaPercentageLabel(rawPercentage) {
  if (rawPercentage === null || rawPercentage === undefined || rawPercentage === '') {
    return '';
  }

  const normalizedValue = String(rawPercentage).trim();
  if (!normalizedValue) return '';

  if (normalizedValue.endsWith('%')) {
    return normalizedValue;
  }

  const numericValue = Number(normalizedValue);
  if (Number.isFinite(numericValue)) {
    return `${numericValue}%`;
  }

  return normalizedValue;
}

function getVoteStatusBadgeClass(status) {
  if (status === 'Completed') return 'success';
  if (status === 'Pending') return 'warning';
  if (status === 'Incompatible') return 'danger';
  if (status === 'Max Judges Voted') return 'danger';
  if (status === 'No Show') return 'noshown';
  if (status === 'Disqualified') return 'danger';
  return 'secondary';
}

function renderVoteStatusBadge(status) {
  const statusText = status ? escapeHtml(status) : '-';
  const badgeClass = getVoteStatusBadgeClass(status);
  return `<span class="badge bg-${badgeClass}">${statusText}</span>`;
}

function shouldCollapseCriteriaByStatus(status) {
  return Boolean(status) && !['Completed', 'Pending'].includes(status);
}

function getCompetitionStatusBadgeInfo(status) {
  if (status === 'OPE') return { label: 'OPEN', className: 'bg-warning text-dark' };
  if (status === 'CLO') return { label: 'CLOSED', className: 'bg-secondary' };
  if (status === 'FIN') return { label: 'FINISHED', className: 'bg-success' };
  if (status === 'PRO') return { label: 'IN PROGRESS', className: 'bg-primary' };
  return { label: status || '-', className: 'bg-secondary' };
}

function renderVotingDetailsModalTitle(competition) {
  const baseTitle = t('voting_details', 'Voting details');
  const titleParts = [competition?.category_name, competition?.style_name]
    .filter(Boolean)
    .map(value => escapeHtml(value));
  const titleText = titleParts.length
    ? `${escapeHtml(baseTitle)}: ${titleParts.join(' - ')}`
    : escapeHtml(baseTitle);

  const statusInfo = getCompetitionStatusBadgeInfo(competition?.status);
  return `${titleText} <span class="badge ${statusInfo.className} ms-2">${escapeHtml(statusInfo.label)}</span>`;
}

function renderCompetitionCriteriaLeadersSummary(competition, criteria) {
  if (!Array.isArray(criteria) || !criteria.length) {
    return '';
  }

  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  if (!dancers.length) {
    return '';
  }

  const criteriaRows = criteria.map((criteriaRef) => {
    const dancerScores = dancers.map((dancer) => {
      const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
      let dancerTotal = 0;
      let hasAnyScore = false;

      votes.forEach((vote) => {
        const detail = findVoteDetailByCriteria(vote, criteriaRef);
        const numericScore = parseCriterionScore(detail?.score);
        if (numericScore === null) return;
        dancerTotal += numericScore;
        hasAnyScore = true;
      });

      return {
        name: dancer?.dancer_name || t('dancer'),
        total: dancerTotal,
        hasAnyScore
      };
    });

    dancerScores.sort((a, b) => {
      if (a.hasAnyScore !== b.hasAnyScore) {
        return a.hasAnyScore ? -1 : 1;
      }
      if (a.hasAnyScore && b.hasAnyScore && a.total !== b.total) {
        return b.total - a.total;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const criteriaName = escapeHtml(criteriaRef?.criteria_name || t('criteria', 'Criteria'));
    const rankingText = dancerScores.length
      ? dancerScores.map((entry) => {
        const dancerName = escapeHtml(entry?.name || t('dancer'));
        const scoreText = entry.hasAnyScore ? formatVoteTotalScore(entry.total) : '-';
        return `${dancerName} <span class="text-muted">(${scoreText})</span>`;
      }).join(', ')
      : '-';

    return `
      <div class="vote-details-criteria-leader-item">
        <span class="vote-details-criteria-leader-name">${criteriaName}:</span>
        <span class="vote-details-criteria-leader-value">${rankingText}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="vote-details-criteria-leaders">
      <div class="accordion" id="voteDetailsCriteriaLeadersAccordion">
        <div class="accordion-item vote-details-criteria-leaders-accordion-item">
          <h2 class="accordion-header" id="voteDetailsCriteriaLeadersHeader">
            <button class="accordion-button collapsed vote-details-criteria-leaders-title" type="button" data-bs-toggle="collapse" data-bs-target="#voteDetailsCriteriaLeadersCollapse" aria-expanded="false" aria-controls="voteDetailsCriteriaLeadersCollapse">
              ${t('top_by_criteria', 'Top score by criteria')}
            </button>
          </h2>
          <div id="voteDetailsCriteriaLeadersCollapse" class="accordion-collapse collapse" aria-labelledby="voteDetailsCriteriaLeadersHeader" data-bs-parent="#voteDetailsCriteriaLeadersAccordion">
            <div class="accordion-body vote-details-criteria-leaders-list">
              ${criteriaRows}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderVoteDetailsFooter(showCriteria = false, showToggle = true) {
  const toggleButton = showToggle
    ? `
      <button
        type="button"
        class="btn btn-outline-primary btn-sm btn-toggle-vote-details"
        data-show-criteria="${showCriteria ? '1' : '0'}"
        aria-pressed="${showCriteria ? 'true' : 'false'}">
        ${showCriteria ? t('hide_vote_details', 'Hide voting details') : t('show_vote_details', 'Show voting details')}
      </button>
    `
    : '';

  return `
    ${toggleButton}
    <button type="button" class="btn btn-secondary btn-sm ms-auto" data-bs-dismiss="modal">${t('close')}</button>
  `;
}

function setVoteDetailsCriteriaVisibility(modalBody, modalFooter, showCriteria, showToggle = true) {
  if (modalBody) {
    modalBody.classList.toggle('vote-details-show-criteria', Boolean(showCriteria));
    modalBody.querySelectorAll('.vote-details-judge-group-head').forEach((headerCell) => {
      const expandedSpan = Number(headerCell.dataset.colspanExpanded || headerCell.colSpan || 1);
      headerCell.colSpan = showCriteria ? expandedSpan : 1;
    });
  }
  if (modalFooter) {
    modalFooter.innerHTML = renderVoteDetailsFooter(showCriteria, showToggle);
  }
}

function renderCompetitionVotingDetailsTable(competition) {
  const judges = getCompetitionJudges(competition);
  const criteria = getCompetitionCriteria(competition, judges);
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  const criteriaLeadersSummary = renderCompetitionCriteriaLeadersSummary(competition, criteria);

  if (!judges.length || !dancers.length) {
    return `
      <div class="mb-4">
        <div class="alert alert-info mb-0">${t('no_data')}</div>
      </div>
    `;
  }

  const hasCriteria = criteria.length > 0;
  const detailColumnsPerJudge = hasCriteria ? (criteria.length + 1) : 1;
  const staticColumnsCount = 2;
  const detailCols = judges.map(() => {
    if (!hasCriteria) {
      return '<col class="vote-details-col-judge-total">';
    }

    const criteriaCols = new Array(criteria.length)
      .fill('<col class="vote-details-col-criteria vote-details-criteria-col">')
      .join('');
    return `${criteriaCols}<col class="vote-details-col-judge-total">`;
  }).join('');

  const judgeHeaderCells = judges.map((judge) => {
    const reserveBadge = parseJudgeFlag(judge?.reserve)
      ? `<span class="badge bg-secondary ms-1" title="${t('judge_in_reserve')}">R</span>`
      : '';
    const headBadge = parseJudgeFlag(judge?.head)
      ? `<span class="badge bg-dark ms-1" title="${t('judge_is_head', 'Head Judge')}">H</span>`
      : '';
    return `
      <th class="text-center vote-details-judge-group-head" colspan="${detailColumnsPerJudge}" data-colspan-expanded="${detailColumnsPerJudge}">
        ${escapeHtml(judge?.name || '')}${reserveBadge}${headBadge}
      </th>
    `;
  }).join('');

  const criteriaHeaderCells = judges.map(() => {
    if (!hasCriteria) {
      return `<th class="text-center vote-details-criteria-head vote-details-judge-total-head">${t('total')}</th>`;
    }

    const criteriaHeads = criteria.map(item => {
      const rawName = item?.criteria_name || '';
      const percentageText = formatCriteriaPercentageLabel(item?.percentage);
      const caption = percentageText ? `${rawName} (${percentageText})` : rawName;
      const captionEscaped = escapeHtml(caption);
      const nameEscaped = escapeHtml(rawName);
      const percentageEscaped = escapeHtml(percentageText);
      return `
        <th class="text-center vote-details-criteria-head vote-details-criteria-col" title="${captionEscaped}">
          <span class="vote-details-criteria-caption">
            <span class="vote-details-criteria-name">${nameEscaped}</span>
            ${percentageText ? `<span class="vote-details-criteria-percentage">${percentageEscaped}</span>` : ''}
          </span>
        </th>
      `;
    }).join('');

    return `
      ${criteriaHeads}
      <th class="text-center vote-details-criteria-head vote-details-judge-total-head" title="${t('total')}">${t('total')}</th>
    `;
  }).join('');

  const rows = dancers.map(dancer => {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    const dancerName = escapeHtml(dancer?.dancer_name || '');
    const positionBadge = dancer?.position
      ? `<span class="badge bg-info vote-details-dancer-badge">#${escapeHtml(dancer.position)}</span>`
      : '';
    const dancerTotalScore = formatVoteTotalScore(dancer?.total_score);

    const judgeCells = judges.map((judge) => {
      const vote = votes.find(v => String(v?.judge?.id) === String(judge?.id));
      if (!vote) {
        if (!hasCriteria) {
          return '<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell text-muted">-</td>';
        }
        const emptyCriteriaCells = new Array(criteria.length)
          .fill('<td class="vote-details-cell vote-details-score-cell text-muted vote-details-criteria-col">-</td>')
          .join('');
        return `${emptyCriteriaCells}<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell text-muted">-</td>`;
      }

      const statusTitle = escapeHtml(vote?.status || '');
      if (!hasCriteria) {
        const score = formatVoteTotalScore(vote?.total);
        if (shouldCollapseCriteriaByStatus(vote?.status)) {
          return `<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${renderVoteStatusBadge(vote?.status)}</td>`;
        }
        return `<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${score}</td>`;
      }

      if (shouldCollapseCriteriaByStatus(vote?.status)) {
        const judgeTotalScore = formatVoteTotalScore(vote?.total);
        return `
          <td class="vote-details-cell vote-details-status-cell vote-details-criteria-col" colspan="${criteria.length}" title="${statusTitle}">
            ${renderVoteStatusBadge(vote?.status)}
          </td>
          <td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${judgeTotalScore}</td>
        `;
      }

      const criteriaCells = criteria.map(criteriaRef => {
        const detail = findVoteDetailByCriteria(vote, criteriaRef);
        const score = formatVoteScore(detail?.score);
        return `<td class="vote-details-cell vote-details-score-cell vote-details-criteria-col" title="${statusTitle}">${score}</td>`;
      }).join('');

      const judgeTotalScore = formatVoteTotalScore(vote?.total);
      return `${criteriaCells}<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${judgeTotalScore}</td>`;
    }).join('');

    return `
      <tr>
        <th scope="row" class="text-start vote-details-sticky-col">
          <div class="vote-details-dancer-cell">
            <span class="vote-details-dancer-name" title="${dancerName}">${dancerName}</span>
            ${positionBadge}
          </div>
        </th>
        <td class="vote-details-cell vote-details-score-cell vote-details-dancer-total-cell">${dancerTotalScore}</td>
        ${judgeCells}
      </tr>
    `;
  }).join('');

  return `
    ${criteriaLeadersSummary}
    <div class="vote-details-scroll-group">
      <div class="vote-details-scrollbar-top" aria-hidden="true">
        <div class="vote-details-scrollbar-spacer"></div>
      </div>
      <div class="vote-details-table-wrap">
        <table class="table table-bordered align-middle text-center vote-details-table mb-0" data-static-cols="${staticColumnsCount}">
          <colgroup>
            <col class="vote-details-col-dancer">
            <col class="vote-details-col-dancer-total">
            ${detailCols}
          </colgroup>
          <thead class="table-light">
            <tr>
              <th class="text-start vote-details-sticky-col" rowspan="2">${t('dancer')}</th>
              <th class="text-center vote-details-total-head" rowspan="2">${t('total')}</th>
              ${judgeHeaderCells}
            </tr>
            <tr>
              ${criteriaHeaderCells}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function initVoteDetailsScrollSync(container) {
  if (!container) return;

  const groups = container.querySelectorAll('.vote-details-scroll-group');
  groups.forEach(group => {
    const topBar = group.querySelector('.vote-details-scrollbar-top');
    const spacer = group.querySelector('.vote-details-scrollbar-spacer');
    const tableWrap = group.querySelector('.vote-details-table-wrap');
    const tableEl = group.querySelector('.vote-details-table');
    if (!topBar || !spacer || !tableWrap || !tableEl) return;

    const updateScrollbar = () => {
      spacer.style.width = `${tableWrap.scrollWidth}px`;
      const hasHorizontalOverflow = tableWrap.scrollWidth > (tableWrap.clientWidth + 1);
      topBar.style.display = hasHorizontalOverflow ? 'block' : 'none';
      if (hasHorizontalOverflow) {
        topBar.scrollLeft = tableWrap.scrollLeft;
      }

      const firstHeaderRow = tableEl.querySelector('thead tr:first-child');
      if (firstHeaderRow) {
        const rowHeight = Math.ceil(firstHeaderRow.getBoundingClientRect().height);
        tableEl.style.setProperty('--vote-details-header-second-row-top', `${rowHeight}px`);
      }
    };

    if (!group.dataset.scrollSyncBound) {
      let syncingFromTop = false;
      let syncingFromTable = false;

      topBar.addEventListener('scroll', () => {
        if (syncingFromTable) return;
        syncingFromTop = true;
        tableWrap.scrollLeft = topBar.scrollLeft;
        syncingFromTop = false;
      });

      tableWrap.addEventListener('scroll', () => {
        if (syncingFromTop) return;
        syncingFromTable = true;
        topBar.scrollLeft = tableWrap.scrollLeft;
        syncingFromTable = false;
      });

      group.dataset.scrollSyncBound = '1';
    }

    updateScrollbar();
    requestAnimationFrame(updateScrollbar);
  });
}

function initVoteDetailsGridHover(container) {
  if (!container) return;

  const clearHover = (table) => {
    table.querySelectorAll('.vote-details-hover-row').forEach(row => row.classList.remove('vote-details-hover-row'));
    table.querySelectorAll('.vote-details-hover-col').forEach(cell => cell.classList.remove('vote-details-hover-col'));
    table._hoverColStart = null;
    table._hoverColEnd = null;
    table._hoverRowEl = null;
  };

  const getCellRange = (cell) => {
    if (!cell || !cell.parentElement) {
      return { start: 0, end: 0 };
    }

    let start = 0;
    const siblings = Array.from(cell.parentElement.children);
    for (const sibling of siblings) {
      if (sibling === cell) break;
      start += Number(sibling.colSpan || 1);
    }

    const span = Math.max(1, Number(cell.colSpan || 1));
    return {
      start,
      end: start + span - 1
    };
  };

  const rangesOverlap = (startA, endA, startB, endB) => {
    return startA <= endB && startB <= endA;
  };

  const highlightColumnRange = (table, colStart, colEnd) => {
    const firstHeaderRow = table.querySelector('thead tr:first-child');
    const secondHeaderRow = table.querySelector('thead tr:nth-child(2)');
    const staticCols = Number(table.dataset.staticCols || 1);

    if (firstHeaderRow) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        if (colIndex < staticCols) {
          const staticHead = firstHeaderRow.cells[colIndex];
          if (staticHead) staticHead.classList.add('vote-details-hover-col');
        }
      }
    }

    if (secondHeaderRow) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        if (colIndex >= staticCols) {
          const criteriaHead = secondHeaderRow.cells[colIndex - staticCols];
          if (criteriaHead) criteriaHead.classList.add('vote-details-hover-col');
        }
      }
    }

    if (firstHeaderRow && colEnd >= staticCols) {
      let currentStart = staticCols;
      const headerCells = Array.from(firstHeaderRow.cells).filter((cell, idx) => idx >= staticCols);
      for (const headerCell of headerCells) {
        const span = Number(headerCell.colSpan || 1);
        const groupStart = currentStart;
        const groupEnd = currentStart + span - 1;
        if (rangesOverlap(colStart, colEnd, groupStart, groupEnd)) {
          headerCell.classList.add('vote-details-hover-col');
        }
        currentStart += span;
      }
    }

    table.querySelectorAll('tbody tr').forEach(row => {
      Array.from(row.children).forEach((rowCell) => {
        const { start, end } = getCellRange(rowCell);
        if (rangesOverlap(colStart, colEnd, start, end)) {
          rowCell.classList.add('vote-details-hover-col');
        }
      });
    });
  };

  container.querySelectorAll('.vote-details-table').forEach(table => {
    if (table.dataset.hoverBound === '1') return;

    table.addEventListener('mousemove', (event) => {
      const cell = event.target.closest('tbody td, tbody th');
      if (!cell || !table.contains(cell)) {
        clearHover(table);
        return;
      }

      const row = cell.parentElement;
      const cellRange = getCellRange(cell);
      if (
        table._hoverRowEl === row &&
        table._hoverColStart === cellRange.start &&
        table._hoverColEnd === cellRange.end
      ) {
        return;
      }

      clearHover(table);
      row.classList.add('vote-details-hover-row');
      highlightColumnRange(table, cellRange.start, cellRange.end);
      table._hoverRowEl = row;
      table._hoverColStart = cellRange.start;
      table._hoverColEnd = cellRange.end;
    });

    table.addEventListener('mouseleave', () => clearHover(table));
    table.dataset.hoverBound = '1';
  });
}

function adjustVoteDetailsModalWidth(modalEl, modalBody) {
  const dialogEl = modalEl?.querySelector('.modal-dialog');
  if (!dialogEl) return;

  const viewportMaxWidth = Math.max(640, Math.floor(window.innerWidth * 0.96));
  const compactDefaultMaxWidth = Math.min(viewportMaxWidth, 820);

  if (!modalBody) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const tables = Array.from(modalBody.querySelectorAll('.vote-details-table'));
  if (!tables.length) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const widestTable = tables.reduce((maxWidth, tableEl) => {
    const measuredWidth = Math.ceil(tableEl.getBoundingClientRect().width || 0);
    const scrollWidth = tableEl.scrollWidth || 0;
    return Math.max(maxWidth, measuredWidth, scrollWidth);
  }, 0);
  if (!widestTable) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const bodyStyles = window.getComputedStyle(modalBody);
  const horizontalBodyPadding = (parseFloat(bodyStyles.paddingLeft) || 0) + (parseFloat(bodyStyles.paddingRight) || 0);
  const modalChromeSpace = 40;
  const desiredModalWidth = Math.ceil(widestTable + horizontalBodyPadding + modalChromeSpace);
  dialogEl.style.maxWidth = `${Math.min(viewportMaxWidth, desiredModalWidth)}px`;
}

function scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody) {
  adjustVoteDetailsModalWidth(modalEl, modalBody);
  requestAnimationFrame(() => adjustVoteDetailsModalWidth(modalEl, modalBody));
  setTimeout(() => adjustVoteDetailsModalWidth(modalEl, modalBody), 0);
  setTimeout(() => adjustVoteDetailsModalWidth(modalEl, modalBody), 120);
}

async function showCompetitionVotingDetails(categoryId, styleId) {
  if (!categoryId || !styleId) return;

  const requestKey = `${categoryId}-${styleId}`;
  if (competitionDetailsInFlight.has(requestKey)) return;
  competitionDetailsInFlight.add(requestKey);

  const modalEl = document.getElementById('voteDetailsModal');
  const modalBody = document.getElementById('voteDetailsBody');
  const modalTitle = modalEl?.querySelector('.modal-title');
  const modalFooter = modalEl?.querySelector('.modal-footer');

  if (!modalEl || !modalBody) {
    competitionDetailsInFlight.delete(requestKey);
    return;
  }

  if (!modalEl.dataset.voteDetailsToggleBound) {
    modalEl.addEventListener('click', (event) => {
      const toggleBtn = event.target.closest('.btn-toggle-vote-details');
      if (!toggleBtn) return;

      const bodyEl = document.getElementById('voteDetailsBody');
      const footerEl = modalEl.querySelector('.modal-footer');
      if (!bodyEl || !footerEl) return;

      const showCriteria = toggleBtn.dataset.showCriteria !== '1';
      setVoteDetailsCriteriaVisibility(bodyEl, footerEl, showCriteria, true);
      initVoteDetailsScrollSync(bodyEl);
      initVoteDetailsGridHover(bodyEl);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, bodyEl);
    });
    modalEl.dataset.voteDetailsToggleBound = '1';
  }

  if (!modalEl.dataset.voteDetailsShownBound) {
    modalEl.addEventListener('shown.bs.modal', () => {
      const body = document.getElementById('voteDetailsBody');
      if (!body) return;
      initVoteDetailsScrollSync(body);
      initVoteDetailsGridHover(body);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, body);
    });
    modalEl.dataset.voteDetailsShownBound = '1';
  }

  if (modalTitle) {
    modalTitle.textContent = t('voting_details', 'Voting details');
  }
  setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);

  modalBody.innerHTML = `
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${t('loading')}</span>
    </div>
  `;
  scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  try {
    const url = `${API_BASE_URL}/api/competitions/tracking/voting-details?event_id=${getEvent().id}&category_id=${categoryId}&style_id=${styleId}`;
    const response = await fetch(url);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || t('error_title'));
    }

    const competitions = Array.isArray(data) ? data : (data ? [data] : []);
    if (!competitions.length) {
      modalBody.innerHTML = `<div class="alert alert-info mb-0">${t('no_data')}</div>`;
      setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
      return;
    }

    const firstCompetition = competitions[0];
    if (modalTitle) {
      modalTitle.innerHTML = renderVotingDetailsModalTitle(firstCompetition);
    }

    modalBody.innerHTML = competitions.map(renderCompetitionVotingDetailsTable).join('');
    setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, true);
    initVoteDetailsScrollSync(modalBody);
    initVoteDetailsGridHover(modalBody);
    scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
    if (!modalEl.dataset.voteDetailsResizeBound) {
      window.addEventListener('resize', () => {
        const body = document.getElementById('voteDetailsBody');
        if (body) {
          initVoteDetailsScrollSync(body);
          initVoteDetailsGridHover(body);
          scheduleVoteDetailsModalWidthAdjustment(modalEl, body);
        }
      });
      modalEl.dataset.voteDetailsResizeBound = '1';
    }
  } catch (error) {
    console.error('Error fetching competition voting details:', error);
    modalBody.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error?.message || t('error_title'))}</div>`;
    setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);
    scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
  } finally {
    competitionDetailsInFlight.delete(requestKey);
  }
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  await WaitEventLoaded();
  await ensureTranslationsReady();
  trackingUiState.sidebarFilters = loadTrackingSidebarFilters();
  initClassificationExportOptions();
  initPenaltyAssignmentModal();
  bindSidebarFilters();
  window.addEventListener('beforeunload', stopLiveTrackingPolling);
  await loadCompetitionSidebar();

  const saveClassificationBtn = document.getElementById('saveClassificationBtn');
  if (saveClassificationBtn) {
    saveClassificationBtn.addEventListener('click', async () => {
      if (!getEvent().canDecidePositions) return;

      const modalEl = document.getElementById('resultsModal');
      const tbody = modalEl?.querySelector('tbody');
      const categoryId = modalEl?.dataset.categoryId;
      const styleId = modalEl?.dataset.styleId;

      if (!tbody || !categoryId || !styleId) return;

      const classification = buildClassificationFromResultsTable(tbody, modalEl?._resultsData);
      const originalText = saveClassificationBtn.innerHTML;

      saveClassificationBtn.disabled = true;
      saveClassificationBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${t('loading')}
      `;

      try {
        const response = await fetch(`${API_BASE_URL}/api/competitions/set-classification`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: getEvent().id,
            category_id: Number(categoryId),
            style_id: Number(styleId),
            classification
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          showMessageModal(data.error || t('error_title'), t('error_title'));
          return;
        }

        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        await reloadSelectedCompetition();
      } catch (err) {
        showMessageModal(err.message || t('error_title'), t('error_title'));
      } finally {
        saveClassificationBtn.disabled = false;
        saveClassificationBtn.innerHTML = originalText;
      }
    });
  }

});

function syncSelectedCompetitionLiveTrackingState(
  competitions = trackingUiState.sidebarCompetitions,
  categoryId = trackingUiState.selectedCategoryId,
  styleId = trackingUiState.selectedStyleId
) {
  if (categoryId === undefined || categoryId === null || categoryId === '') return false;
  if (styleId === undefined || styleId === null || styleId === '') return false;

  const selectedCompetition = findCompetitionByCategoryAndStyle(competitions, categoryId, styleId);
  if (!selectedCompetition) return false;

  const selectedCompetitionId = selectedCompetition?.id ?? selectedCompetition?.competition_id;
  const previousSelectedCompetitionId = String(trackingUiState.selectedCompetitionId || '').trim();
  if (selectedCompetitionId !== undefined && selectedCompetitionId !== null && String(selectedCompetitionId).trim() !== '') {
    const normalizedSelectedCompetitionId = String(selectedCompetitionId).trim();
    trackingUiState.selectedCompetitionId = normalizedSelectedCompetitionId;
    if (normalizedSelectedCompetitionId !== previousSelectedCompetitionId) {
      trackingUiState.selectedCompetitionRevision = null;
    }
  }

  const selectedCompetitionRevision = extractCompetitionRevision(selectedCompetition);
  if (selectedCompetitionRevision !== null) {
    trackingUiState.selectedCompetitionRevision = selectedCompetitionRevision;
  }

  return true;
}

function stopLiveTrackingPolling() {
  if (liveTrackingState.intervalId) {
    clearInterval(liveTrackingState.intervalId);
    liveTrackingState.intervalId = null;
  }
  liveTrackingState.competitionId = null;
  liveTrackingState.isPolling = false;
}

function ensureLiveTrackingPolling() {
  const selectedCompetitionId = String(trackingUiState.selectedCompetitionId || '').trim();
  if (!selectedCompetitionId) {
    stopLiveTrackingPolling();
    return;
  }

  if (liveTrackingState.intervalId && String(liveTrackingState.competitionId) === selectedCompetitionId) {
    return;
  }

  stopLiveTrackingPolling();
  liveTrackingState.competitionId = selectedCompetitionId;
  liveTrackingState.intervalId = setInterval(() => {
    void pollSelectedCompetitionRevision();
  }, LIVE_TRACKING_POLL_INTERVAL_MS);
}

async function pollSelectedCompetitionRevision() {
  const selectedCompetitionId = String(trackingUiState.selectedCompetitionId || '').trim();
  if (!selectedCompetitionId || liveTrackingState.isPolling) return;

  liveTrackingState.isPolling = true;
  const pollingCompetitionId = selectedCompetitionId;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/${encodeURIComponent(pollingCompetitionId)}/revision`);
    if (!response.ok) {
      throw new Error(`Failed to fetch revision for competition ${pollingCompetitionId}`);
    }

    const payload = await response.json().catch(() => ({}));
    if (String(trackingUiState.selectedCompetitionId || '').trim() !== pollingCompetitionId) {
      return;
    }

    const nextRevision = extractCompetitionRevision(payload);
    if (nextRevision === null) return;

    const currentRevision = normalizeCompetitionRevision(trackingUiState.selectedCompetitionRevision);
    if (currentRevision === null) {
      trackingUiState.selectedCompetitionRevision = nextRevision;
      return;
    }

    if (nextRevision <= currentRevision) return;

    trackingUiState.selectedCompetitionRevision = nextRevision;
    await executeGetCompetitions(
      trackingUiState.selectedCategoryId,
      trackingUiState.selectedStyleId,
      {
        competitionId: pollingCompetitionId,
        revision: nextRevision
      }
    );
  } catch (error) {
    console.error('Error polling competition revision:', error);
  } finally {
    liveTrackingState.isPolling = false;
  }
}

async function executeGetCompetitions(categoryId, styleId, options = {}) {
  const {
    competitionId = null,
    revision = null
  } = options;

  if (categoryId === undefined || categoryId === null || categoryId === '') return;
  if (styleId === undefined || styleId === null || styleId === '') return;

  const previousCompetitionId = String(trackingUiState.selectedCompetitionId || '').trim();
  trackingUiState.selectedCategoryId = String(categoryId);
  trackingUiState.selectedStyleId = String(styleId);

  const normalizedCompetitionId = String(competitionId || '').trim();
  if (normalizedCompetitionId) {
    trackingUiState.selectedCompetitionId = normalizedCompetitionId;
    if (normalizedCompetitionId !== previousCompetitionId) {
      trackingUiState.selectedCompetitionRevision = null;
    }
  }

  const normalizedRevision = normalizeCompetitionRevision(revision);
  if (normalizedRevision !== null) {
    trackingUiState.selectedCompetitionRevision = normalizedRevision;
  }

  if (!normalizedCompetitionId && normalizedRevision === null) {
    syncSelectedCompetitionLiveTrackingState(trackingUiState.sidebarCompetitions, categoryId, styleId);
  }

  ensureLiveTrackingPolling();
  updateSidebarSelectedCompetition(trackingUiState.selectedCategoryId, trackingUiState.selectedStyleId);
  await loadCompetitions(
    trackingUiState.selectedCategoryId,
    trackingUiState.selectedStyleId,
    { syncSidebarState: true }
  );
}

async function reloadSelectedCompetition(options = {}) {
  if (!trackingUiState.selectedCategoryId || !trackingUiState.selectedStyleId) return;
  await loadCompetitions(trackingUiState.selectedCategoryId, trackingUiState.selectedStyleId, options);
}

async function changeCompetitionStatus(compId, action, options = {}) {
  const {
    reloadMain = false,
    reloadSidebar = false
  } = options;

  const response = await fetch(`${API_BASE_URL}/api/competitions/${compId}/changestatus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: getEvent().id, action })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || t('error_change_competition_status'));
  }

  if (reloadMain) {
    await reloadSelectedCompetition();
    return;
  }

  if (reloadSidebar) {
    await loadCompetitionSidebar();
  }
}


async function loadCompetitions(categoryId, styleId, options = {}) {
  const {
    reloadSidebar = false,
    syncSidebarState = false
  } = options;
  try {
    trackingUiState.selectedCategoryId = String(categoryId);
    trackingUiState.selectedStyleId = String(styleId);

    let url = `${API_BASE_URL}/api/competitions/tracking?event_id=${getEvent().id}&category_id=${categoryId}`;
    if (styleId) {
      url += `&style_id=${styleId}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const competitions = await response.json();
    renderCompetitions(competitions);
    if (reloadSidebar) {
      await loadCompetitionSidebar();
    } else if (syncSidebarState) {
      syncSelectedCompetitionSidebarState(competitions, categoryId, styleId);
      rerenderSidebarPreservingScroll();
    }

    const syncedFromTracking = syncSelectedCompetitionLiveTrackingState(competitions, categoryId, styleId);
    const syncedFromSidebar = syncedFromTracking
      || syncSelectedCompetitionLiveTrackingState(trackingUiState.sidebarCompetitions, categoryId, styleId);
    if (!syncedFromSidebar) {
      trackingUiState.selectedCompetitionId = null;
      trackingUiState.selectedCompetitionRevision = null;
    }
    ensureLiveTrackingPolling();

    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
    return competitions;
  } catch (error) {
    console.error('Error fetching competitions:', error);
    return [];
  }
}

function getCompetitionListStatusLabel(status) {
  if (status === 'OPE') return 'OPEN';
  if (status === 'CLO') return 'CLOSED';
  if (status === 'FIN') return 'FINISHED';
  if (status === 'PRO') return 'IN PROGRESS';
  return status || '-';
}

function getCompetitionListStatusBadgeClass(status) {
  if (status === 'OPE') return 'bg-warning text-dark';
  if (status === 'CLO') return 'bg-danger';
  if (status === 'FIN') return 'bg-success';
  if (status === 'PRO') return 'bg-primary';
  return 'bg-secondary';
}

function shouldShowTrackingPenaltyAction() {
  const rawHasPenalties = getEvent()?.has_penalties;
  if (rawHasPenalties === true || rawHasPenalties === 1) return true;
  if (typeof rawHasPenalties === 'string') {
    const normalized = rawHasPenalties.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function getCompetitionStatusFromAction(action) {
  if (action === 'open') return 'OPE';
  if (action === 'close') return 'CLO';
  return null;
}

function updateSidebarSelectedCompetition(categoryId, styleId) {
  const container = document.getElementById('competitionsSidebarList');
  if (!container) return;

  const selectedCategoryId = String(categoryId ?? '');
  const selectedStyleId = String(styleId ?? '');

  container.querySelectorAll('.js-sidebar-competition-item').forEach(item => {
    const itemCategoryId = String(item.dataset.categoryId ?? '');
    const itemStyleId = String(item.dataset.styleId ?? '');
    const listItem = item.closest('.list-group-item');
    if (!listItem) return;

    const isSelected = itemCategoryId === selectedCategoryId && itemStyleId === selectedStyleId;
    listItem.classList.toggle('sidebar-competition-item-active', isSelected);

    const liveIndicator = listItem.querySelector('.js-live-tracking-indicator');
    if (liveIndicator) {
      liveIndicator.classList.toggle('d-none', !isSelected);
    }
  });
}

function normalizeSidebarCompetitionStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return '';
  if (value === 'OPEN') return 'OPE';
  if (value === 'CLOSED') return 'CLO';
  if (value === 'FINISHED') return 'FIN';
  if (value === 'IN PROGRESS') return 'PRO';
  return value;
}

function getSidebarCompetitionCategoryLabel(comp) {
  return String(comp?.category_name ?? comp?.category?.name ?? '').trim();
}

function getSidebarCompetitionStyleLabel(comp) {
  return String(comp?.style_name ?? comp?.style?.name ?? '').trim();
}

function getSidebarCompetitionCategoryKey(comp) {
  const categoryId = comp?.category_id ?? comp?.category?.id;
  if (categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== '') {
    return `id:${String(categoryId).trim()}`;
  }
  const label = getSidebarCompetitionCategoryLabel(comp);
  return label ? `name:${label.toLowerCase()}` : '';
}

function getSidebarCompetitionStyleKey(comp) {
  const styleId = comp?.style_id ?? comp?.style?.id;
  if (styleId !== undefined && styleId !== null && String(styleId).trim() !== '') {
    return `id:${String(styleId).trim()}`;
  }
  const label = getSidebarCompetitionStyleLabel(comp);
  return label ? `name:${label.toLowerCase()}` : '';
}

function getSidebarCompetitionStatusKey(comp) {
  return normalizeSidebarCompetitionStatus(comp?.status);
}

function syncSidebarFilterLabels() {
  const categorySelect = document.getElementById('trackingCategoryFilter');
  const styleSelect = document.getElementById('trackingStyleFilter');
  const statusSelect = document.getElementById('trackingStatusFilter');

  if (categorySelect) {
    const label = t('category', 'Categoria');
    categorySelect.setAttribute('aria-label', label);
    categorySelect.setAttribute('title', label);
  }
  if (styleSelect) {
    const label = t('style', 'Estilo');
    styleSelect.setAttribute('aria-label', label);
    styleSelect.setAttribute('title', label);
  }
  if (statusSelect) {
    const label = t('status', 'Estado');
    statusSelect.setAttribute('aria-label', label);
    statusSelect.setAttribute('title', label);
  }
}

function populateSidebarFilterSelect(select, options, selectedValue, allLabel) {
  if (!select) return;
  select.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });

  const hasSelection = selectedValue && options.some(item => String(item.value) === String(selectedValue));
  select.value = hasSelection ? selectedValue : '';
}

function getDistinctSidebarOptions(list, getKey, getLabel) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(comp => {
    const key = getKey(comp);
    const label = getLabel(comp);
    if (!key || !label) return;
    if (!map.has(key)) {
      map.set(key, label);
    }
  });

  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
}

function getDistinctSidebarStatusOptions(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach(comp => {
    const statusKey = getSidebarCompetitionStatusKey(comp);
    if (!statusKey) return;
    if (!map.has(statusKey)) {
      map.set(statusKey, getCompetitionListStatusLabel(statusKey));
    }
  });

  const order = ['OPE', 'PRO', 'CLO', 'FIN'];
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      const aOrder = order.indexOf(a.value);
      const bOrder = order.indexOf(b.value);
      if (aOrder !== -1 || bOrder !== -1) {
        if (aOrder === -1) return 1;
        if (bOrder === -1) return -1;
        return aOrder - bOrder;
      }
      return String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' });
    });
}

function renderSidebarFilters(competitions = trackingUiState.sidebarCompetitions) {
  const categorySelect = document.getElementById('trackingCategoryFilter');
  const styleSelect = document.getElementById('trackingStyleFilter');
  const statusSelect = document.getElementById('trackingStatusFilter');
  if (!categorySelect || !styleSelect || !statusSelect) return;

  syncSidebarFilterLabels();

  const categories = getDistinctSidebarOptions(
    competitions,
    getSidebarCompetitionCategoryKey,
    getSidebarCompetitionCategoryLabel
  );
  const styles = getDistinctSidebarOptions(
    competitions,
    getSidebarCompetitionStyleKey,
    getSidebarCompetitionStyleLabel
  );
  const statuses = getDistinctSidebarStatusOptions(competitions);
  const statusFilterOptions = [
    {
      value: SIDEBAR_STATUS_FILTER_NOT_FINISHED,
      label: t('tracking_filters_not_finished', 'No finalizados')
    },
    ...statuses
  ];
  const allCategoriesLabel = t('tracking_filters_all_categories', 'Todas Categorías');
  const allStylesLabel = t('tracking_filters_all_styles', 'Todos Estilos');
  const allStatusesLabel = t('tracking_filters_all_statuses', 'Todos Estados');

  populateSidebarFilterSelect(categorySelect, categories, trackingUiState.sidebarFilters.category, allCategoriesLabel);
  populateSidebarFilterSelect(styleSelect, styles, trackingUiState.sidebarFilters.style, allStylesLabel);
  populateSidebarFilterSelect(statusSelect, statusFilterOptions, trackingUiState.sidebarFilters.status, allStatusesLabel);

  trackingUiState.sidebarFilters.category = categorySelect.value || '';
  trackingUiState.sidebarFilters.style = styleSelect.value || '';
  trackingUiState.sidebarFilters.status = statusSelect.value || '';
  saveTrackingSidebarFilters();
}

function bindSidebarFilters() {
  const categorySelect = document.getElementById('trackingCategoryFilter');
  const styleSelect = document.getElementById('trackingStyleFilter');
  const statusSelect = document.getElementById('trackingStatusFilter');
  if (!categorySelect || !styleSelect || !statusSelect) return;

  syncSidebarFilterLabels();

  [categorySelect, styleSelect, statusSelect].forEach(select => {
    select.addEventListener('change', () => {
      trackingUiState.sidebarFilters.category = categorySelect.value || '';
      trackingUiState.sidebarFilters.style = styleSelect.value || '';
      trackingUiState.sidebarFilters.status = statusSelect.value || '';
      saveTrackingSidebarFilters();
      renderCompetitionSidebar();
    });
  });
}

function getFilteredSidebarCompetitions(competitions = trackingUiState.sidebarCompetitions) {
  const filters = trackingUiState.sidebarFilters || {};
  return (Array.isArray(competitions) ? competitions : []).filter(comp => {
    if (filters.category && getSidebarCompetitionCategoryKey(comp) !== filters.category) return false;
    if (filters.style && getSidebarCompetitionStyleKey(comp) !== filters.style) return false;
    if (filters.status) {
      const competitionStatus = getSidebarCompetitionStatusKey(comp);
      if (filters.status === SIDEBAR_STATUS_FILTER_NOT_FINISHED) {
        if (competitionStatus === 'FIN') return false;
      } else if (competitionStatus !== filters.status) {
        return false;
      }
    }
    return true;
  });
}

function updateSidebarCompetitionStatusInState(compId, nextStatus) {
  const normalized = normalizeSidebarCompetitionStatus(nextStatus);
  if (!normalized || !Array.isArray(trackingUiState.sidebarCompetitions)) return;

  const target = trackingUiState.sidebarCompetitions.find(comp => String(comp?.id) === String(compId));
  if (target) {
    target.status = normalized;
  }
}

function findCompetitionByCategoryAndStyle(competitions, categoryId, styleId) {
  return (Array.isArray(competitions) ? competitions : []).find(comp => {
    const compCategoryId = comp?.category_id ?? comp?.category?.id ?? '';
    const compStyleId = comp?.style_id ?? comp?.style?.id ?? '';
    return String(compCategoryId) === String(categoryId) && String(compStyleId) === String(styleId);
  }) || null;
}

function syncSelectedCompetitionSidebarState(competitions, categoryId, styleId) {
  if (!Array.isArray(trackingUiState.sidebarCompetitions) || trackingUiState.sidebarCompetitions.length === 0) {
    return false;
  }

  const selectedCompetition = findCompetitionByCategoryAndStyle(
    competitions,
    categoryId ?? trackingUiState.selectedCategoryId,
    styleId ?? trackingUiState.selectedStyleId
  );
  if (!selectedCompetition) return false;

  const sidebarCompetition = trackingUiState.sidebarCompetitions.find(comp => {
    const sameId = comp?.id !== undefined
      && comp?.id !== null
      && selectedCompetition?.id !== undefined
      && selectedCompetition?.id !== null
      && String(comp.id) === String(selectedCompetition.id);
    if (sameId) return true;

    const compCategoryId = comp?.category_id ?? comp?.category?.id ?? '';
    const compStyleId = comp?.style_id ?? comp?.style?.id ?? '';
    const selectedCategoryId = selectedCompetition?.category_id ?? selectedCompetition?.category?.id ?? '';
    const selectedStyleId = selectedCompetition?.style_id ?? selectedCompetition?.style?.id ?? '';
    return String(compCategoryId) === String(selectedCategoryId)
      && String(compStyleId) === String(selectedStyleId);
  });
  if (!sidebarCompetition) return false;

  sidebarCompetition.status = normalizeSidebarCompetitionStatus(selectedCompetition?.status) || sidebarCompetition.status;
  sidebarCompetition.clasification_visible = parseClassificationVisible(selectedCompetition?.clasification_visible) ? 1 : 0;
  const selectedRevision = extractCompetitionRevision(selectedCompetition);
  if (selectedRevision !== null) {
    sidebarCompetition.revision = selectedRevision;
  }
  return true;
}

function updateSidebarCompetitionClassificationVisibilityInState(categoryId, styleId, isVisible) {
  if (!Array.isArray(trackingUiState.sidebarCompetitions) || trackingUiState.sidebarCompetitions.length === 0) {
    return false;
  }

  const target = trackingUiState.sidebarCompetitions.find(comp => {
    const compCategoryId = comp?.category_id ?? comp?.category?.id ?? '';
    const compStyleId = comp?.style_id ?? comp?.style?.id ?? '';
    return String(compCategoryId) === String(categoryId)
      && String(compStyleId) === String(styleId);
  });
  if (!target) return false;

  target.clasification_visible = isVisible ? 1 : 0;
  return true;
}

function rerenderSidebarPreservingScroll() {
  const container = document.getElementById('competitionsSidebarList');
  const previousScrollTop = container ? container.scrollTop : 0;
  renderSidebarFilters();
  renderCompetitionSidebar();
  if (container) {
    container.scrollTop = previousScrollTop;
  }
}

function renderCompetitionSidebar(competitions = trackingUiState.sidebarCompetitions) {
  const container = document.getElementById('competitionsSidebarList');
  if (!container) return;

  const filteredCompetitions = getFilteredSidebarCompetitions(competitions);
  if (!Array.isArray(filteredCompetitions) || filteredCompetitions.length === 0) {
    container.innerHTML = `
      <div class="list-group-item text-center text-muted py-3">
        ${escapeHtml(t('no_competitions_found'))}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredCompetitions.map(comp => {
    const categoryName = comp?.category_name || '-';
    const styleName = comp?.style_name || '-';
    const categoryId = comp?.category_id ?? comp?.category?.id ?? '';
    const styleId = comp?.style_id ?? comp?.style?.id ?? '';
    const compId = comp?.id ?? '';
    const competitionRevision = extractCompetitionRevision(comp);
    const status = getCompetitionListStatusLabel(comp?.status);
    const isFinished = comp?.status === 'FIN';
    const isOpen = comp?.status === 'OPE' || comp?.status === 'PRO';
    const isClassificationVisible = parseClassificationVisible(comp?.clasification_visible);
    const btnDisabled = getEvent().status === 'finished' ? 'disabled' : '';
    const statusBadgeClass = getCompetitionListStatusBadgeClass(comp?.status);
    const estimatedStart = comp?.estimated_start_form || t('not_defined');
    const visibilityButtonDisabled = !isFinished ? 'disabled' : '';
    const statusActionButton = !isFinished
      ? `
        <button
          type="button"
          class="btn btn-outline-${isOpen ? 'warning' : 'success'} btn-sm btn-toggle-status-sidebar"
          data-action="${isOpen ? 'close' : 'open'}"
          data-comp-id="${compId}"
          data-category-id="${categoryId}"
          data-style-id="${styleId}" ${btnDisabled}>
          <i class="bi ${isOpen ? 'bi-lock' : 'bi-unlock'} me-1"></i>
          ${isOpen ? t('close_competition') : t('open_competition')}
        </button>
      `
      : '';
    const isSelected = String(trackingUiState.selectedCategoryId) === String(categoryId)
      && String(trackingUiState.selectedStyleId) === String(styleId);
    const itemClassName = isSelected ? 'list-group-item sidebar-competition-item-active' : 'list-group-item';

    return `
      <div class="${itemClassName}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <button
            type="button"
            class="btn btn-link text-start text-decoration-none p-0 border-0 flex-grow-1 js-sidebar-competition-item"
            data-competition-id="${compId}"
            data-category-id="${categoryId}"
            data-style-id="${styleId}"
            data-revision="${competitionRevision !== null ? competitionRevision : ''}">
            <div class="fw-semibold d-flex align-items-center flex-wrap gap-2">
              <span>${escapeHtml(categoryName)} / ${escapeHtml(styleName)}</span>
              <span
                class="tracking-live-indicator js-live-tracking-indicator ${isSelected ? '' : 'd-none'}"
                title="${escapeHtml(t('tracking_live_tooltip', 'Automatic updates every 30 seconds'))}">
                <span class="tracking-live-dot" aria-hidden="true"></span>
                <span>${escapeHtml(t('tracking_live_badge', 'LiveTracking'))}</span>
              </span>
            </div>
            <small class="text-muted">
              <span class="badge ${statusBadgeClass} js-sidebar-status-badge">${escapeHtml(status)}</span>
              - ${escapeHtml(estimatedStart)}
            </small>
          </button>
          <div class="d-flex flex-column align-items-end text-end gap-2 sidebar-competition-actions">
            ${isFinished ? `
            <small
              class="text-muted js-classification-visible-text sidebar-classification-visible-text"
              data-category-id="${categoryId}"
              data-style-id="${styleId}">${escapeHtml(getClassificationVisibilityText(isClassificationVisible))}</small>
            <button
              type="button"
              class="btn btn-sm ${getSidebarClassificationVisibleButtonClass(isClassificationVisible)} js-classification-visible-btn sidebar-classification-visible-btn"
              data-control-variant="sidebar"
              data-category-id="${categoryId}"
              data-style-id="${styleId}"
              data-visible="${isClassificationVisible ? '1' : '0'}"
              ${visibilityButtonDisabled}>
              ${renderClassificationVisibleButtonContent(isClassificationVisible, 'sidebar')}
            </button>
            ` : ''}
            ${statusActionButton}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.js-sidebar-competition-item').forEach(item => {
    item.addEventListener('click', async () => {
      const categoryId = item.dataset.categoryId;
      const styleId = item.dataset.styleId;
      const competitionId = item.dataset.competitionId;
      const revision = item.dataset.revision;
      if (!categoryId || !styleId) return;
      await executeGetCompetitions(categoryId, styleId, { competitionId, revision });
    });
  });

  container.querySelectorAll('.btn-toggle-status-sidebar').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const compId = btn.dataset.compId;
      const action = btn.dataset.action;
      const categoryId = btn.dataset.categoryId;
      const styleId = btn.dataset.styleId;
      if (!compId || !action) return;

      btn.disabled = true;
      try {
        await changeCompetitionStatus(compId, action);
        const nextStatus = getCompetitionStatusFromAction(action);
        updateSidebarCompetitionStatusInState(compId, nextStatus);
        rerenderSidebarPreservingScroll();

        const isSelectedCompetition = String(trackingUiState.selectedCategoryId) === String(categoryId)
          && String(trackingUiState.selectedStyleId) === String(styleId);
        if (isSelectedCompetition) {
          await reloadSelectedCompetition();
        }
      } catch (error) {
        console.error('Error changing competition status:', error);
        showMessageModal(error?.message || t('error_change_competition_status'), t('error_title'));
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
        }
      }
    });
  });

  container.querySelectorAll('.js-classification-visible-btn').forEach(bindClassificationVisibilityButton);
}

async function loadCompetitionSidebar() {
  const container = document.getElementById('competitionsSidebarList');
  if (!container) return;

  container.innerHTML = `
    <div class="list-group-item d-flex align-items-center justify-content-center py-3">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(t('loading'))}</span>
    </div>
  `;

  try {
    const eventId = getEvent()?.id;
    if (!eventId) {
      throw new Error('Missing event id');
    }

    const response = await fetch(`${API_BASE_URL}/api/competitions?event_id=${eventId}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const competitions = await response.json();
    trackingUiState.sidebarCompetitions = Array.isArray(competitions) ? competitions : [];
    const hasSyncedSelectedCompetition = syncSelectedCompetitionLiveTrackingState(trackingUiState.sidebarCompetitions);
    if (!hasSyncedSelectedCompetition && trackingUiState.selectedCategoryId && trackingUiState.selectedStyleId) {
      trackingUiState.selectedCompetitionId = null;
      trackingUiState.selectedCompetitionRevision = null;
    }
    ensureLiveTrackingPolling();
    renderSidebarFilters(trackingUiState.sidebarCompetitions);
    renderCompetitionSidebar();
  } catch (error) {
    console.error('Error loading competition sidebar:', error);
    trackingUiState.sidebarCompetitions = [];
    renderSidebarFilters(trackingUiState.sidebarCompetitions);
    container.innerHTML = `
      <div class="list-group-item text-danger text-center py-3">
        ${escapeHtml(t('error_title'))}
      </div>
    `;
  }
}

function computeCompetitionProgress(comp) {
  const dancers = Array.isArray(comp?.dancers) ? comp.dancers : [];
  const totalDancers = dancers.length;
  if (!totalDancers) {
    return {
      completed: 0,
      total: 0,
      percentage: 0
    };
  }

  const pendingCount = dancers.filter(dancer => {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    return votes.some(vote => vote?.status === 'Pending');
  }).length;

  const completed = Math.max(0, totalDancers - pendingCount);
  const percentage = Math.round((completed / totalDancers) * 100);
  return {
    completed,
    total: totalDancers,
    percentage
  };
}

function getClassificationVisibleButtonLabel(isVisible) {
  return isVisible
    ? t('classification_visibility_hide_results', 'Ocultar Resultados')
    : t('classification_visibility_show_results', 'Resultados Visibles');
}

function getSidebarClassificationVisibleButtonLabel(isVisible) {
  return isVisible
    ? t('classification_visibility_action_hide', 'Ocultar')
    : t('classification_visibility_action_show', 'Hacer visible');
}

function getClassificationVisibleButtonIcon(isVisible) {
  return isVisible ? 'bi-eye-slash' : 'bi-eye-fill';
}

function getClassificationVisibleButtonClass(isVisible) {
  return isVisible ? 'btn-success' : 'btn-outline-secondary';
}

function getSidebarClassificationVisibleButtonClass(isVisible) {
  return isVisible ? 'btn-outline-secondary' : 'btn-outline-primary';
}

function renderClassificationVisibleButtonContent(isVisible, variant = 'summary') {
  if (variant === 'sidebar') {
    return `
      <i class="bi ${getClassificationVisibleButtonIcon(isVisible)}"></i>
      <span>${getSidebarClassificationVisibleButtonLabel(isVisible)}</span>
    `;
  }

  return `
    <i class="bi ${getClassificationVisibleButtonIcon(isVisible)} me-1"></i>
    <span class="tracking-summary-btn-label">${getClassificationVisibleButtonLabel(isVisible)}</span>
  `;
}

function buildComparisonSummaryCard(comp, statusText, isFinished, isClassificationVisible) {
  const statusBadgeClass = getCompetitionListStatusBadgeClass(comp.status);
  const progress = computeCompetitionProgress(comp);
  const progressBarColorClass = progress.percentage >= 100 ? 'bg-success' : 'bg-warning';
  const progressTextClass = progress.percentage >= 100 ? 'text-white' : 'text-dark';
  const progressText = `${progress.completed}/${progress.total} (${progress.percentage}%)`;
  const visibilityButtonDisabled = !isFinished ? 'disabled' : '';
  const exportButtonDisabled = !isFinished ? 'disabled' : '';
  const visibilityButtonClass = getClassificationVisibleButtonClass(isClassificationVisible);

  const card = document.createElement('div');
  card.className = 'card mb-4 border-primary-subtle';
  card.innerHTML = `
    <div class="card-body">
      <div class="tracking-summary-layout">
        <div class="tracking-summary-top">
          <div class="tracking-summary-badges">
            <span class="badge bg-secondary fs-6 px-2 py-1">${escapeHtml(comp.category_name || '-')}</span>
            <span class="badge bg-secondary fs-6 px-2 py-1">${escapeHtml(comp.style_name || '-')}</span>
            <span class="badge ${statusBadgeClass} fs-6 px-2 py-1">${escapeHtml(statusText || '-')}</span>
          </div>
          <div class="d-flex align-items-center gap-3 tracking-summary-progress">
            <div class="progress flex-grow-1 position-relative" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percentage}" style="height: 30px;">
              <div class="progress-bar progress-bar-striped ${progressBarColorClass}" style="width: ${progress.percentage}%"></div>
              <span class="position-absolute top-50 start-50 translate-middle fw-bold fs-6 text-nowrap ${progressTextClass}">
                ${progressText}
              </span>
            </div>
          </div>
        </div>
        <div class="tracking-summary-actions">
          <button type="button"
            class="btn btn-outline-secondary btn-sm btn-competition-details tracking-summary-btn"
            data-category-id="${comp.category_id}"
            data-style-id="${comp.style_id}"
            data-status="${comp.status}">
            <i class="bi bi-info-circle me-1"></i>
            <span class="tracking-summary-btn-label">${t('view_details')}</span>
          </button>
          <button type="button"
            class="btn btn-outline-primary btn-sm btn-view-results tracking-summary-btn"
            data-category-id="${comp.category_id}"
            data-style-id="${comp.style_id}"
            data-status="${comp.status}">
            <i class="bi bi-trophy me-1"></i>
            <span class="tracking-summary-btn-label">${t('results_button', 'Results')}</span>
          </button>
          <button type="button"
            class="btn btn-sm ${visibilityButtonClass} js-classification-visible-btn tracking-summary-btn"
            data-control-variant="summary"
            data-category-id="${comp.category_id}"
            data-style-id="${comp.style_id}"
            data-visible="${isClassificationVisible ? '1' : '0'}"
            ${visibilityButtonDisabled}>
            ${renderClassificationVisibleButtonContent(isClassificationVisible, 'summary')}
          </button>
          <button type="button"
            class="btn btn-outline-warning btn-sm btn-export-category-results tracking-summary-btn"
            data-category-id="${comp.category_id}"
            data-style-id="${comp.style_id}"
            data-category-name="${escapeHtml(comp.category_name || '-')}"
            data-style-name="${escapeHtml(comp.style_name || '-')}"
            ${exportButtonDisabled}>
            <i class="bi bi-filetype-pdf me-1"></i>
            <span class="tracking-summary-btn-label">${t('export_results_button', 'Export Results')}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  return card;
}

function syncClassificationVisibilityControls(categoryId, styleId, isVisible) {
  const normalizedCategoryId = String(categoryId);
  const normalizedStyleId = String(styleId);
  updateSidebarCompetitionClassificationVisibilityInState(normalizedCategoryId, normalizedStyleId, isVisible);

  document.querySelectorAll('.js-classification-visible-btn').forEach(button => {
    if (String(button.dataset.categoryId) !== normalizedCategoryId) return;
    if (String(button.dataset.styleId) !== normalizedStyleId) return;
    const variant = button.dataset.controlVariant === 'sidebar' ? 'sidebar' : 'summary';
    button.dataset.visible = isVisible ? '1' : '0';
    button.classList.remove('btn-success', 'btn-outline-secondary', 'btn-outline-primary');
    button.classList.add(
      variant === 'sidebar'
        ? getSidebarClassificationVisibleButtonClass(isVisible)
        : getClassificationVisibleButtonClass(isVisible)
    );
    button.innerHTML = renderClassificationVisibleButtonContent(isVisible, variant);
  });

  document.querySelectorAll('.js-classification-visible-text').forEach(text => {
    if (String(text.dataset.categoryId) !== normalizedCategoryId) return;
    if (String(text.dataset.styleId) !== normalizedStyleId) return;
    text.textContent = getClassificationVisibilityText(isVisible);
  });
}

async function setClassificationVisibility(categoryId, styleId, nextVisible) {
  const response = await fetch(`${API_BASE_URL}/api/competitions/set-classification-visible`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: Number(getEvent().id),
      category_id: Number(categoryId),
      style_id: Number(styleId),
      visible: nextVisible
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || t('error_set_classification_visible', 'Error updating result visibility.'));
  }
}

function bindClassificationVisibilityButton(button) {
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;

    const categoryId = Number(button.dataset.categoryId);
    const styleId = Number(button.dataset.styleId);
    const currentVisible = button.dataset.visible === '1';
    const nextVisible = !currentVisible;

    if (!Number.isFinite(categoryId) || !Number.isFinite(styleId)) {
      showMessageModal(t('error_set_classification_visible', 'Error updating result visibility.'), t('error_title'));
      return;
    }

    const confirmMessage = nextVisible
      ? t('confirm_classification_visible_on', 'Are you sure you want to make the result visible?')
      : t('confirm_classification_visible_off', 'Are you sure you want to hide the result?');

    const confirmed = await showModal(confirmMessage);
    if (!confirmed) return;

    button.disabled = true;
    try {
      await setClassificationVisibility(categoryId, styleId, nextVisible);
      syncClassificationVisibilityControls(categoryId, styleId, nextVisible);
    } catch (error) {
      showMessageModal(error?.message || t('error_set_classification_visible', 'Error updating result visibility.'), t('error_title'));
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  });
}

function renderCompetitions(competitions) {
  const container = document.getElementById('competitionsContainer');
  const showPenaltyAction = shouldShowTrackingPenaltyAction();
  container.innerHTML = '';

  let btnDisabled = '';
  if (getEvent().status === 'finished') {
    btnDisabled = 'disabled';
  }

  if (!competitions || competitions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warning text-center my-4">
        ${t('no_competitions_found')}
      </div>
    `;
    return;
  }

  competitions.forEach((comp, index) => {

    let statusText;
    if (comp.status === 'OPE') {
      statusText = 'OPEN';
    } else if (comp.status === 'FIN') {
      statusText = 'FINISHED';
    } else if (comp.status === 'CLO') {
      statusText = 'CLOSED';      
    } else if (comp.status === 'PRO') {
      statusText = 'IN PROGRESS';
    } else {
      statusText = comp.status;
    }
    const isFinished = comp.status === 'FIN';
    const isClassificationVisible = parseClassificationVisible(comp.clasification_visible);

    const comparisonCard = buildComparisonSummaryCard(comp, statusText, isFinished, isClassificationVisible);
    container.appendChild(comparisonCard);

    // Tabla de votaciones
    if (!comp.judges.length || !comp.dancers.length) {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-info text-center';
      alertDiv.textContent = t('no_data');
      container.appendChild(alertDiv);
    } else {
      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-responsive mx-auto mb-4';

      let tableHTML = `
        <table class="table table-bordered align-middle text-center">
          <thead class="table-light">
            <tr>
              <th>${t('dancer')}</th>
              ${comp.judges.map(j => `
                <th class="text-center">
                  ${j.name}
                  ${parseJudgeFlag(j.reserve) ? `<span class="badge bg-secondary ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_in_reserve')}">R</span>` : ''}
                  ${parseJudgeFlag(j.head) ? `<span class="badge bg-dark ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_is_head', 'Head Judge')}">H</span>` : ''}
                </th>
              `).join('')}              
              <th>${t('voted')}</th>
              <th>${t('total')}</th>
              ${shouldShowAvgPlaceColumn() ? `<th>${t('avg_place')}</th>` : ''}
            </tr>
          </thead>
          <tbody>
      `;

      const competitionId = comp.id ?? comp.competition_id ?? '';
      const competitionLabel = `${comp.category_name || ''}${comp.style_name ? ` - ${comp.style_name}` : ''}`.trim();

      comp.dancers.forEach(d => {
        const dancerFlagHtml = getDancerFlagImgHtml(d.nationality, {
          className: 'me-2',
          style: 'vertical-align: middle;'
        });
        const penaltiesCount = Number(d?.num_penalties) || 0;
        const hasPenalties = penaltiesCount > 0;
        const penaltiesTooltip = escapeHtml(t('dancer_has_penalties_tooltip', 'Tiene penalizaciones'));
        const penaltiesIndicatorHtml = hasPenalties
          ? `
              <span
                class="tracking-penalties-indicator"
                data-bs-toggle="tooltip"
                data-bs-placement="top"
                title="${penaltiesTooltip}"
                aria-label="${penaltiesTooltip}">
                <i class="bi bi-exclamation-octagon-fill"></i>
                <span>${penaltiesCount}</span>
              </span>
            `
          : '';

        const dancerCell = `
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              ${dancerFlagHtml}
              <span>${d.dancer_name}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
              ${penaltiesIndicatorHtml}
              <div class="dropdown">
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false" ${btnDisabled}>
                  ${t('actions')}
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li>
                    <button class="dropdown-item js-no-show"
                      type="button"
                      data-category-id="${comp.category_id}"
                      data-style-id="${comp.style_id}"
                      data-dancer-id="${d.dancer_id ?? d.id}"
                      data-dancer-name="${d.dancer_name}" ${btnDisabled}>
                      ${t('no_show')}
                    </button>
                  </li>
                  <li>
                    <button class="dropdown-item js-disqualify"
                      type="button"
                      data-category-id="${comp.category_id}"
                      data-style-id="${comp.style_id}"
                      data-dancer-id="${d.dancer_id ?? d.id}"
                      data-dancer-name="${d.dancer_name}" ${btnDisabled}>
                      ${t('disqualify')}
                    </button>
                  </li>
                  ${showPenaltyAction ? `
                    <li>
                      <button class="dropdown-item js-penalty-action"
                        type="button"
                        data-competition-id="${competitionId}"
                        data-category-id="${comp.category_id}"
                        data-style-id="${comp.style_id}"
                        data-dancer-id="${d.dancer_id ?? d.id}"
                        data-dancer-name="${escapeHtml(d.dancer_name || '')}"
                        data-competition-label="${escapeHtml(competitionLabel)}"
                        data-assigned-by="O"
                        ${btnDisabled}>
                        ${t('penalty')}
                      </button>
                    </li>
                  ` : ''}
                </ul>
              </div>
              <span class="badge bg-info">#${d.position}</span>
            </div>
          </div>
        `;

        const voteCells = d.votes.map((v, judgeIndex) => {
          let badgeClass = 'secondary';
          if (v.status === 'Completed') badgeClass = 'success';
          else if (v.status === 'Pending') badgeClass = 'warning';
          else if (v.status === 'Incompatible') badgeClass = 'danger';
          else if (v.status === 'Max Judges Voted') badgeClass = 'danger';
          else if (v.status === 'No Show') badgeClass = 'noshown';
          else if (v.status === 'Disqualified') badgeClass = 'danger';

          // async function resetVote(categoryId, styleId, judgeId, dancerId, rowId) {

          let ind = `${comp.id}-${d.dancer_id}-${v.judge.id}`; // ID de la fila para localizarla en reset

          if (['Completed', 'No Show', 'Disqualified'].includes(v.status)) {

            let params = `${comp.category_id}, ${comp.style_id}, ${v.judge.id}, ${d.dancer_id}, '${ind}', '${d.dancer_name}', '${v.judge.name}'`;
            let showEye = v.status === 'Completed';
            
            return `
              <td class="text-center" id="row-${ind}">
                <div class="d-flex justify-content-between align-items-center">
                  <!-- Ver detalles (izquierda) -->
                  <button class="btn btn-link text-primary p-0" 
                    onclick="showVoteDetails(${params})" 
                    title="${t('ver_detalles')}"
                    style="visibility: ${showEye ? 'visible' : 'hidden'};">
                    <i class="bi bi-eye"></i>
                  </button>

                  <!-- Badge (centro) -->
                  <span class="badge status-badge bg-${badgeClass}">${v.status}</span>

                  <!-- Reiniciar voto (derecha) -->
                  <button class="btn btn-link text-danger p-0" 
                    onclick="resetVote(${params})" 
                    title="${t('reiniciar_voto')}" ${btnDisabled}>
                    <i class="bi bi-arrow-counterclockwise"></i>
                  </button>
                </div>
              </td>
            `;

          }

          return `<td class="text-center" id="row-${ind}"><span class="badge status-badge bg-${badgeClass}">${v.status}</span></td>`;
        }).join('');

        // Asignar ID a la fila combinando competición-dancer-judge (para poder localizarla en reset)
        const parsedTotalScore = Number(d?.total_score);
        const totalScoreValue = Number.isFinite(parsedTotalScore) ? parsedTotalScore : 0;
        const totalScoreText = formatResultScore(totalScoreValue);
        const parsedTotalPenalties = Number(d?.total_penalties);
        const totalPenaltiesValue = Number.isFinite(parsedTotalPenalties) ? parsedTotalPenalties : 0;
        const totalWithPenaltiesText = formatResultScore(totalScoreValue + totalPenaltiesValue);
        const totalCellHtml = hasPenalties
          ? `
            <div class="d-inline-flex justify-content-center position-relative" style="line-height: 1;">
              <span class="text-danger" style="position: absolute; left: 50%; transform: translate(-50%, -0.75rem); font-size: 0.75em; white-space: nowrap;">${totalWithPenaltiesText}</span>
              <span>${totalScoreText}</span>
            </div>
          `
          : `${totalScoreText}`;
        const avgPlaceText = formatAvgPlace(d.avg_place);
        tableHTML += `<tr id="row-${comp.id}-${d.id}">${'<td>' + dancerCell + '</td>' + voteCells}        
        <td class="bg-light">${d.judges_voted}</td>
        <td class="bg-light">${totalCellHtml}</td>
        ${shouldShowAvgPlaceColumn() ? `<td class="bg-light">${avgPlaceText}</td>` : ''}</tr>`;
      });

      tableHTML += '</tbody></table>';
      tableContainer.innerHTML = tableHTML;
      container.appendChild(tableContainer);
    }

    // Separador entre competiciones (menos después de la última)
    if (index < competitions.length - 1) {
      const hr = document.createElement('hr');
      hr.className = 'my-4 mx-auto';
      hr.style.width = '200px';
      container.appendChild(hr);
    }
  });

  container.querySelectorAll('.js-no-show').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await markNoShow(
        btn.dataset.categoryId,
        btn.dataset.styleId,
        btn.dataset.dancerId,
        btn.dataset.dancerName
      );
    });
  });

  container.querySelectorAll('.js-disqualify').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await markDisqualified(
        btn.dataset.categoryId,
        btn.dataset.styleId,
        btn.dataset.dancerId,
        btn.dataset.dancerName
      );
    });
  });

  container.querySelectorAll('.js-penalty-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await openPenaltyAssignmentModal({
        competitionId: btn.dataset.competitionId,
        categoryId: btn.dataset.categoryId,
        styleId: btn.dataset.styleId,
        dancerId: btn.dataset.dancerId,
        dancerName: btn.dataset.dancerName,
        competitionLabel: btn.dataset.competitionLabel,
        assignedBy: btn.dataset.assignedBy
      });
    });
  });

  container.querySelectorAll('.btn-competition-details').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await showCompetitionVotingDetails(btn.dataset.categoryId, btn.dataset.styleId);
    });
  });

  container.querySelectorAll('.btn-view-results').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await showResults(btn.dataset.categoryId, btn.dataset.styleId, btn.dataset.status);
    });
  });

  container.querySelectorAll('.js-classification-visible-btn').forEach(bindClassificationVisibilityButton);

  container.querySelectorAll('.btn-export-category-results').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;

      const eventId = Number(getEvent()?.id);
      const categoryId = Number(button.dataset.categoryId);
      const categoryName = button.dataset.categoryName || '-';
      const styleName = button.dataset.styleName || '-';
      const competitionLabel = `${categoryName}-${styleName}`;

      if (!Number.isFinite(eventId) || !Number.isFinite(categoryId)) {
        showMessageModal(t('error_title'), t('error_title'));
        return;
      }

      const confirmTemplate = t(
        'confirm_export_category_pdf',
        'Are you sure you want to export to PDF the full category for competition {competition}?'
      );
      const confirmMessage = confirmTemplate.replace('{competition}', competitionLabel);

      const confirmed = await showModal(confirmMessage);
      if (!confirmed) return;

      setButtonLoading(button, true, t('exporting', 'Exporting...'));
      try {
        await exportClassificationResults(eventId, { all: false, categories: [categoryId] });
      } catch (error) {
        console.error('Error exporting category results:', error);
        showMessageModal(error?.message || t('error_title'), t('error_title'));
      } finally {
        if (button.isConnected) {
          setButtonLoading(button, false);
        }
      }
    });
  });

  initActionDropdowns(container);
}

function initActionDropdowns(container) {
  container.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(btn => {
    if (bootstrap.Dropdown.getInstance(btn)) return;
    new bootstrap.Dropdown(btn, {
      popperConfig: {
        strategy: 'fixed',
        modifiers: [
          { name: 'preventOverflow', options: { boundary: 'viewport' } }
        ]
      }
    });
  });
}

async function showVoteDetails(categoryId, styleId, judgeId, dancerId, rowId, dancerName, judgeName) {
  if (voteDetailsInFlight.has(rowId)) {
    return;
  }
  voteDetailsInFlight.add(rowId);

  document.getElementById('detailsModalLabel').textContent = `${t('judge')}: ${judgeName} / ${t('dancer')}: ${dancerName}`;

  criteriaContainer.innerHTML = '';

  let total = 0;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting?event_id=${getEvent().id}&judge=${judgeId}&category=${categoryId}&style=${styleId}`);
    if (!res.ok) {
      throw new Error(t('error_fetch_vote_details'));
    }

    const data = await res.json();

    const formatCriteriaLabel = (criteria) => {
      const rawPercentage = criteria?.percentage;
      if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') {
        return criteria.name;
      }
      const percentageNumber = Number(rawPercentage);
      if (Number.isNaN(percentageNumber)) {
        return criteria.name;
      }
      return `${criteria.name} (${percentageNumber}%)`;
    };

    // Filtramos dancerId de data.dancers
    data.dancers = data.dancers.find(d => d.id === dancerId);
    if (!data.dancers) throw new Error(t('error_vote_details_dancer_not_found'));

    data.criteria.forEach(c => {
      const value = data.dancers.scores?.[c.name] ?? '-';
      const col = document.createElement('div');
      col.className = 'col-6 text-center';

      // Solo lectura
      if (typeof value === 'number') total += value;
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${formatCriteriaLabel(c)}</div>
        <span class="badge bg-info fs-5">${value}</span>
      `;    

      criteriaContainer.appendChild(col);
    });

    // Total
    const totalCol = document.createElement('div');
    totalCol.className = 'col-12 mt-3 text-center';
    totalCol.innerHTML = `
      <div class="fw-bold mb-1">${t('total')}</div>
      <span id="totalScore" class="badge bg-success fs-4 px-4">${data.dancers.totalScore}</span>
    `;
    criteriaContainer.appendChild(totalCol);

    const modalEl = document.getElementById('detailsModal');
    let modal = new bootstrap.Modal(modalEl);

    // Footer  limpiar primero
    const footer = modal._element.querySelector('.modal-footer');
    footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">${t('close')}</button>`;

    modal.show();
  } catch (error) {
    console.error('Error loading vote details modal:', error);
    showMessageModal(error?.message || t('error_fetch_vote_details'), t('error_title'));
  } finally {
    voteDetailsInFlight.delete(rowId);
  }
}

async function resetVote(categoryId, styleId, judgeId, dancerId, rowId, dancerName, judgeName) {

  const confirmed = await showModal(`${t('confirm_reset_1')} "${judgeName}" ${t('confirm_reset_2')} "${dancerName}"?`);

  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/resetVoting?event_id=${getEvent().id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        style_id: styleId,
        judge_id: judgeId,
        dancer_id: dancerId
      })
    });

    if (!res.ok) throw new Error('Error al reiniciar el voto');

    const data = await res.json();
    
    if (data.success) {
      await reloadSelectedCompetition({ syncSidebarState: true });
    }


  } catch (err) {
    alert(err.message);
  }
}

async function markNoShow(categoryId, styleId, dancerId, dancerName) {
  const confirmed = await showModal(`${t('confirm_no_show_1')} "${dancerName}"${t('confirm_no_show_2')}`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/markNoShow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: Number(getEvent().id),
        category_id: Number(categoryId),
        style_id: Number(styleId),
        dancer_id: Number(dancerId)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessageModal(data.error || t('error_mark_no_show'), t('error_title'));
      return;
    }

    await reloadSelectedCompetition({ syncSidebarState: true });
  } catch (err) {
    showMessageModal(err.message || t('error_mark_no_show'), t('error_title'));
  }
}

async function markDisqualified(categoryId, styleId, dancerId, dancerName) {
  const confirmed = await showModal(`${t('confirm_disqualify_1')} "${dancerName}"${t('confirm_disqualify_2')}`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/setDesqualified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: Number(getEvent().id),
        category_id: Number(categoryId),
        style_id: Number(styleId),
        dancer_id: Number(dancerId)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessageModal(data.error || t('error_set_disqualified'), t('error_title'));
      return;
    }

    await reloadSelectedCompetition({ syncSidebarState: true });
  } catch (err) {
    showMessageModal(err.message || t('error_set_disqualified'), t('error_title'));
  }
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function extractArrayPayload(payload, candidateKeys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of candidateKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizePenaltyDefinition(rawPenalty) {
  const id = parseOptionalNumber(rawPenalty?.id ?? rawPenalty?.penalty_id);
  if (id === null) return null;

  let minPenalty = parseOptionalNumber(rawPenalty?.min_penalty);
  let maxPenalty = parseOptionalNumber(rawPenalty?.max_penalty);

  if (minPenalty === null && maxPenalty !== null) minPenalty = maxPenalty;
  if (maxPenalty === null && minPenalty !== null) maxPenalty = minPenalty;
  if (minPenalty === null && maxPenalty === null) {
    minPenalty = 0;
    maxPenalty = 0;
  }

  const safeMin = Math.min(minPenalty, maxPenalty);
  const safeMax = Math.max(minPenalty, maxPenalty);
  const name = String(rawPenalty?.name || '').trim() || `${t('penalty', 'Penalty')} #${id}`;

  return {
    id,
    name,
    forJudges: parseJudgeFlag(rawPenalty?.for_judges),
    minPenalty: safeMin,
    maxPenalty: safeMax,
    isFixedScore: safeMin === safeMax
  };
}

function normalizeCompetitionPenalty(rawPenalty) {
  const penaltyId = parseOptionalNumber(rawPenalty?.penalty_id ?? rawPenalty?.id);
  if (penaltyId === null) return null;
  const rawAssignedBy = String(rawPenalty?.assigned_by || '').trim().toUpperCase();
  const assignedBy = (rawAssignedBy === 'O' || rawAssignedBy === 'J') ? rawAssignedBy : null;

  return {
    penaltyId,
    score: parseOptionalNumber(rawPenalty?.penalty_score),
    assignedBy
  };
}

async function fetchPenaltyDefinitionsForEvent(eventId) {
  const response = await fetch(`${API_BASE_URL}/api/penalties?event_id=${eventId}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || t('penalty_modal_load_error', 'Error loading penalties.'));
  }

  const penaltyItems = extractArrayPayload(payload, ['penalties']);
  const uniqueById = new Map();

  penaltyItems.forEach((item) => {
    const normalized = normalizePenaltyDefinition(item);
    if (!normalized) return;
    uniqueById.set(String(normalized.id), normalized);
  });

  return Array.from(uniqueById.values())
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
}

async function fetchCompetitionPenaltiesForDancer(eventId, competitionId, dancerId) {
  const url = `${API_BASE_URL}/api/competitions/penalties?event_id=${eventId}&competition_id=${competitionId}&dancer_id=${dancerId}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(payload?.error || t('penalty_modal_load_error', 'Error loading penalties.'));
  }

  const competitionPenaltyItems = extractArrayPayload(payload, ['competition_penalties', 'penalties']);
  const uniqueByPenaltyId = new Map();

  competitionPenaltyItems.forEach((item) => {
    const normalized = normalizeCompetitionPenalty(item);
    if (!normalized) return;
    uniqueByPenaltyId.set(String(normalized.penaltyId), normalized);
  });

  return Array.from(uniqueByPenaltyId.values());
}

function renderPenaltyAssignmentLoadingState() {
  return `
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(t('loading'))}</span>
    </div>
  `;
}

function setPenaltyAssignmentSaveDisabled(disabled) {
  const saveBtn = document.getElementById('penaltyAssignmentSaveBtn');
  if (!saveBtn) return;
  saveBtn.disabled = Boolean(disabled);
}

function clearPenaltyAssignmentValidationMessage() {
  const validationEl = document.getElementById('penaltyAssignmentValidation');
  if (!validationEl) return;
  validationEl.textContent = '';
  validationEl.classList.add('d-none');
}

function setPenaltyAssignmentValidationMessage(message) {
  const validationEl = document.getElementById('penaltyAssignmentValidation');
  if (!validationEl) return;
  validationEl.textContent = message || '';
  validationEl.classList.toggle('d-none', !message);
}

function syncPenaltyAssignmentSelectionSummary() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const summaryEl = document.getElementById('penaltyAssignmentSummary');
  const totalBadgeEl = document.getElementById('penaltyAssignmentTotalBadge');
  if (!bodyEl || !summaryEl) return;

  const rows = Array.from(bodyEl.querySelectorAll('.js-penalty-row'));
  let selectedCount = 0;
  let totalPenaltyScore = 0;

  rows.forEach((rowEl) => {
    const toggleEl = rowEl.querySelector('.js-penalty-toggle');
    if (!toggleEl?.checked) return;

    selectedCount += 1;
    const scoreInput = rowEl.querySelector('.js-penalty-score');
    const parsedScore = parseOptionalNumber(scoreInput?.value);
    if (parsedScore !== null) {
      totalPenaltyScore += parsedScore;
      return;
    }

    const fixedScore = parseOptionalNumber(rowEl.dataset.minPenalty);
    if (fixedScore !== null) {
      totalPenaltyScore += fixedScore;
    }
  });

  summaryEl.textContent = `${selectedCount} ${t('penalty_modal_selected_count', 'penalties applied')}`;
  if (totalBadgeEl) {
    totalBadgeEl.textContent = `${totalPenaltyScore}`;
  }
}

function syncPenaltyAssignmentRow(rowEl) {
  if (!rowEl) return;

  const toggleEl = rowEl.querySelector('.js-penalty-toggle');
  const scoreInput = rowEl.querySelector('.js-penalty-score');
  const feedbackEl = rowEl.querySelector('.js-penalty-score-feedback');
  if (!toggleEl || !scoreInput) return;

  const isChecked = toggleEl.checked;
  const isFixedScore = rowEl.dataset.fixedScore === '1';
  const minPenalty = parseOptionalNumber(rowEl.dataset.minPenalty);

  scoreInput.classList.remove('is-invalid');
  if (feedbackEl) {
    feedbackEl.textContent = '';
  }

  if (!isChecked) {
    scoreInput.disabled = true;
    scoreInput.readOnly = false;
    scoreInput.value = '';
    return;
  }

  if (isFixedScore) {
    scoreInput.disabled = true;
    scoreInput.readOnly = false;
    scoreInput.value = minPenalty !== null ? String(minPenalty) : '';
    return;
  }

  scoreInput.disabled = false;
  scoreInput.readOnly = false;
  if (scoreInput.value === '' && minPenalty !== null) {
    scoreInput.value = String(minPenalty);
  }
}

function collectPenaltyAssignmentsFromModal() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  if (!bodyEl) {
    return { isValid: false, assignments: [] };
  }

  const rows = Array.from(bodyEl.querySelectorAll('.js-penalty-row'));
  const assignments = [];
  let isValid = true;

  rows.forEach((rowEl) => {
    const toggleEl = rowEl.querySelector('.js-penalty-toggle');
    const scoreInput = rowEl.querySelector('.js-penalty-score');
    const feedbackEl = rowEl.querySelector('.js-penalty-score-feedback');
    if (!toggleEl || !scoreInput) return;

    scoreInput.classList.remove('is-invalid');
    if (feedbackEl) feedbackEl.textContent = '';

    if (!toggleEl.checked) return;

    const penaltyId = parseOptionalNumber(rowEl.dataset.penaltyId);
    const isFixedScore = rowEl.dataset.fixedScore === '1';
    const minPenalty = parseOptionalNumber(rowEl.dataset.minPenalty);
    const maxPenalty = parseOptionalNumber(rowEl.dataset.maxPenalty);

    if (penaltyId === null) {
      isValid = false;
      return;
    }

    let score = minPenalty;
    if (!isFixedScore) {
      score = parseOptionalNumber(scoreInput.value);
      if (score === null) {
        isValid = false;
        scoreInput.classList.add('is-invalid');
        if (feedbackEl) {
          feedbackEl.textContent = t('penalty_modal_score_required', 'Score is required.');
        }
        return;
      }
      if (
        (minPenalty !== null && score < minPenalty) ||
        (maxPenalty !== null && score > maxPenalty)
      ) {
        isValid = false;
        scoreInput.classList.add('is-invalid');
        if (feedbackEl) {
          feedbackEl.textContent = t('penalty_modal_score_out_of_range', 'Score must be within range.');
        }
        return;
      }
    }

    assignments.push({
      penalty_id: penaltyId,
      penalty_score: score
    });
  });

  return { isValid, assignments };
}

async function saveCompetitionPenalties({ eventId, competitionId, dancerId, assignedBy = 'O', penalties = [] } = {}) {
  const normalizedAssignedBy = String(assignedBy).trim().toUpperCase() === 'J' ? 'J' : 'O';
  const response = await fetch(`${API_BASE_URL}/api/competitions/penalties`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: Number(eventId),
      competition_id: Number(competitionId),
      dancer_id: Number(dancerId),
      assigned_by: normalizedAssignedBy,
      penalties
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error
      || payload?.message
      || t('penalty_modal_save_error', 'Error saving penalties.')
    );
  }

  return payload;
}

function renderPenaltyAssignmentModalContent() {
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  if (!bodyEl) return;

  const context = penaltyAssignmentState.context || {};
  const penalties = Array.isArray(penaltyAssignmentState.penalties) ? penaltyAssignmentState.penalties : [];
  const allCompetitionPenalties = Array.isArray(penaltyAssignmentState.competitionPenalties)
    ? penaltyAssignmentState.competitionPenalties
    : [];
  const competitionPenalties = context?.assignedBy === 'J'
    ? allCompetitionPenalties.filter(item => item?.assignedBy === 'J')
    : allCompetitionPenalties;

  if (!penalties.length) {
    bodyEl.innerHTML = `
      <div class="alert alert-info mb-0">
        ${escapeHtml(t('penalty_modal_no_penalties', 'No penalties available.'))}
      </div>
    `;
    setPenaltyAssignmentSaveDisabled(true);
    return;
  }

  const selectedByPenaltyId = new Map();
  competitionPenalties.forEach((item) => {
    if (item?.penaltyId === null || item?.penaltyId === undefined) return;
    selectedByPenaltyId.set(String(item.penaltyId), item);
  });

  const rowsHtml = penalties.map((penalty, index) => {
    const selectedPenalty = selectedByPenaltyId.get(String(penalty.id)) || null;
    const isSelected = Boolean(selectedPenalty);
    const scoreValue = isSelected
      ? (penalty.isFixedScore ? penalty.minPenalty : (selectedPenalty?.score ?? ''))
      : '';
    const rangeText = penalty.isFixedScore
      ? String(penalty.minPenalty)
      : `${penalty.minPenalty} - ${penalty.maxPenalty}`;
    const fixedBadge = penalty.isFixedScore
      ? `<span class="badge text-bg-warning text-dark penalty-fixed-badge">${escapeHtml(t('penalty_modal_fixed_score', 'Fixed'))}</span>`
      : '';
    const assignedByBadge = selectedPenalty?.assignedBy === 'O'
      ? `<span class="badge bg-primary">${escapeHtml(t('penalty_modal_assigned_by_org', 'ORGANIZATION'))}</span>`
      : selectedPenalty?.assignedBy === 'J'
        ? `<span class="badge bg-dark">${escapeHtml(t('penalty_modal_assigned_by_jury', 'JURY'))}</span>`
        : '<span class="text-muted">-</span>';
    const forJudgesIcon = penalty.forJudges
      ? '<i class="bi bi-check-circle-fill text-success"></i>'
      : '<i class="bi bi-dash-circle text-muted"></i>';
    const inputId = `penaltyScore_${penalty.id}_${index}`;

    return `
      <tr
        class="js-penalty-row"
        data-penalty-id="${penalty.id}"
        data-min-penalty="${penalty.minPenalty}"
        data-max-penalty="${penalty.maxPenalty}"
        data-fixed-score="${penalty.isFixedScore ? '1' : '0'}"
      >
        <td class="text-center align-middle">
          <input class="form-check-input js-penalty-toggle" type="checkbox" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="align-middle penalty-col-name">
          <div class="fw-semibold">${escapeHtml(penalty.name)}</div>
        </td>
        <td class="text-center align-middle penalty-col-assigned-by">
          ${assignedByBadge}
        </td>
        <td class="text-center align-middle penalty-col-for-judges" title="${escapeHtml(t('penalty_modal_for_judges', 'For judges'))}">
          ${forJudgesIcon}
        </td>
        <td class="text-center align-middle penalty-col-range">
          <div class="d-inline-flex align-items-center justify-content-center gap-1 flex-wrap">
            <span class="badge text-bg-light border">${escapeHtml(rangeText)}</span>
            ${fixedBadge}
          </div>
        </td>
        <td class="align-middle penalty-col-score">
          <input
            id="${inputId}"
            type="number"
            class="form-control form-control-sm js-penalty-score"
            min="${penalty.minPenalty}"
            max="${penalty.maxPenalty}"
            step="1"
            value="${escapeHtml(scoreValue)}"
            ${(isSelected && !penalty.isFixedScore) ? '' : 'disabled'}
          >
          <div class="invalid-feedback js-penalty-score-feedback"></div>
        </td>
      </tr>
    `;
  }).join('');

  const dancerName = context?.dancerName || t('dancer');
  const competitionLabel = String(context?.competitionLabel || '').trim();

  bodyEl.innerHTML = `
    <div class="mb-3 penalty-assignment-header">
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div class="penalty-assignment-participant fw-semibold">${escapeHtml(dancerName)}</div>
        <div class="d-inline-flex align-items-center gap-1">
          <span class="badge bg-dark">${escapeHtml(t('penalty_modal_total_penalties_label', 'TOTAL PENALTIES'))}</span>
          <span id="penaltyAssignmentTotalBadge" class="badge bg-danger">0</span>
        </div>
      </div>
      ${competitionLabel
    ? `<span class="badge text-bg-light border penalty-assignment-competition-badge">${escapeHtml(competitionLabel)}</span>`
    : ''}
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle mb-2 penalty-assignment-table">
        <thead class="table-light">
          <tr>
            <th class="text-center penalty-col-apply">${escapeHtml(t('penalty_modal_apply', 'Apply'))}</th>
            <th class="penalty-col-name">${escapeHtml(t('penalty_modal_name', 'Penalty'))}</th>
            <th class="text-center penalty-col-assigned-by">${escapeHtml(t('penalty_modal_assigned_by', 'Asignado por'))}</th>
            <th class="text-center penalty-col-for-judges">${escapeHtml(t('penalty_modal_for_judges', 'For judges'))}</th>
            <th class="text-center penalty-col-range">${escapeHtml(t('penalty_modal_range', 'Range'))}</th>
            <th class="penalty-col-score">${escapeHtml(t('penalty_modal_score', 'Score'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    <div id="penaltyAssignmentValidation" class="alert alert-warning py-2 mb-2 d-none"></div>
    <small class="text-muted" id="penaltyAssignmentSummary"></small>
  `;

  Array.from(bodyEl.querySelectorAll('.js-penalty-row')).forEach(syncPenaltyAssignmentRow);
  syncPenaltyAssignmentSelectionSummary();
  clearPenaltyAssignmentValidationMessage();
  setPenaltyAssignmentSaveDisabled(false);
}

function initPenaltyAssignmentModal() {
  const modalEl = document.getElementById('penaltyAssignmentModal');
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const saveBtn = document.getElementById('penaltyAssignmentSaveBtn');
  if (!modalEl || !bodyEl || !saveBtn) return;
  if (modalEl.dataset.initialized === '1') return;

  bodyEl.addEventListener('change', (event) => {
    const toggleEl = event.target.closest('.js-penalty-toggle');
    if (!toggleEl) return;
    const rowEl = toggleEl.closest('.js-penalty-row');
    syncPenaltyAssignmentRow(rowEl);
    syncPenaltyAssignmentSelectionSummary();
    clearPenaltyAssignmentValidationMessage();
  });

  bodyEl.addEventListener('input', (event) => {
    const scoreInput = event.target.closest('.js-penalty-score');
    if (!scoreInput) return;
    scoreInput.classList.remove('is-invalid');
    const rowEl = scoreInput.closest('.js-penalty-row');
    const feedbackEl = rowEl?.querySelector('.js-penalty-score-feedback');
    if (feedbackEl) {
      feedbackEl.textContent = '';
    }
    clearPenaltyAssignmentValidationMessage();
  });

  saveBtn.addEventListener('click', async () => {
    const { isValid, assignments } = collectPenaltyAssignmentsFromModal();
    if (!isValid) {
      setPenaltyAssignmentValidationMessage(
        t('penalty_modal_validation_error', 'Review penalty scores before continuing.')
      );
      return;
    }

    const context = penaltyAssignmentState.context || {};
    const eventId = parseOptionalNumber(context?.eventId);
    const competitionId = parseOptionalNumber(context?.competitionId);
    const dancerId = parseOptionalNumber(context?.dancerId);
    const assignedBy = String(context?.assignedBy || 'O').trim().toUpperCase() === 'J' ? 'J' : 'O';
    if (eventId === null || competitionId === null || dancerId === null) {
      showMessageModal(t('error_title'), t('error_title'));
      return;
    }

    clearPenaltyAssignmentValidationMessage();
    setButtonLoading(saveBtn, true, t('loading'));

    try {
      const result = await saveCompetitionPenalties({
        eventId,
        competitionId,
        dancerId,
        assignedBy,
        penalties: assignments
      });

      penaltyAssignmentState.competitionPenalties = assignments.map(item => ({
        penaltyId: item.penalty_id,
        score: item.penalty_score,
        assignedBy
      }));

      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.hide();
      await reloadSelectedCompetition();

      const fallbackMessage = result?.changed
        ? t('penalty_modal_saved', 'Penalties saved successfully.')
        : t('penalty_modal_no_changes', 'No penalty changes detected.');
      showMessageModal(result?.message || fallbackMessage, t('penalty'), 'success');
    } catch (error) {
      console.error('Error saving competition penalties:', error);
      showMessageModal(
        error?.message || t('penalty_modal_save_error', 'Error saving penalties.'),
        t('error_title')
      );
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    penaltyAssignmentState.context = null;
    penaltyAssignmentState.penalties = [];
    penaltyAssignmentState.competitionPenalties = [];
    bodyEl.innerHTML = renderPenaltyAssignmentLoadingState();
    setPenaltyAssignmentSaveDisabled(false);
    clearPenaltyAssignmentValidationMessage();
  });

  modalEl.dataset.initialized = '1';
}

async function openPenaltyAssignmentModal({ competitionId, dancerId, dancerName, competitionLabel = '', assignedBy = 'O' } = {}) {
  const modalEl = document.getElementById('penaltyAssignmentModal');
  const bodyEl = document.getElementById('penaltyAssignmentModalBody');
  const modalTitleEl = document.getElementById('penaltyAssignmentModalLabel');
  if (!modalEl || !bodyEl || !modalTitleEl) return;

  const eventId = parseOptionalNumber(getEvent()?.id);
  const parsedCompetitionId = parseOptionalNumber(competitionId);
  const parsedDancerId = parseOptionalNumber(dancerId);

  if (eventId === null || parsedCompetitionId === null || parsedDancerId === null) {
    showMessageModal(t('error_title'), t('error_title'));
    return;
  }

  penaltyAssignmentState.context = {
    eventId,
    competitionId: parsedCompetitionId,
    dancerId: parsedDancerId,
    dancerName: dancerName || t('dancer'),
    competitionLabel,
    assignedBy: String(assignedBy).trim().toUpperCase() === 'J' ? 'J' : 'O'
  };

  modalTitleEl.textContent = t('penalty_modal_title', 'Penalties');
  bodyEl.innerHTML = renderPenaltyAssignmentLoadingState();
  clearPenaltyAssignmentValidationMessage();
  setPenaltyAssignmentSaveDisabled(true);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  try {
    const [penalties, competitionPenalties] = await Promise.all([
      fetchPenaltyDefinitionsForEvent(eventId),
      fetchCompetitionPenaltiesForDancer(eventId, parsedCompetitionId, parsedDancerId)
    ]);

    penaltyAssignmentState.penalties = penalties;
    penaltyAssignmentState.competitionPenalties = competitionPenalties;
    renderPenaltyAssignmentModalContent();
  } catch (error) {
    console.error('Error loading competition penalties:', error);
    bodyEl.innerHTML = `
      <div class="alert alert-danger mb-0">
        ${escapeHtml(error?.message || t('penalty_modal_load_error', 'Error loading penalties.'))}
      </div>
    `;
    setPenaltyAssignmentSaveDisabled(true);
  }
}

function showModal(message) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('deleteModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const titleEl = modalEl.querySelector('.modal-title');
    if (titleEl) {
      titleEl.textContent = t('confirm_action_title', 'Confirm action');
    }
    document.getElementById('deleteModalMessage').textContent = message;

    let confirmed = false;

    const onConfirm = () => {
      confirmed = true;
      modal.hide();
    };

    const onHidden = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
      resolve(confirmed);
    };

    confirmBtn.addEventListener('click', onConfirm);
    modalEl.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
  });
}

function formatResultScore(totalScore) {
  if (getEvent().criteriaConfig === 'WITH_POR') {
    return Number(totalScore ?? 0).toFixed(1);
  }
  return totalScore ?? 0;
}

function formatAvgPlace(avgPlace) {
  return avgPlace ?? '';
}

function shouldShowAvgPlaceColumn() {
  return getEvent().totalSystem === 'AVG_POSJUD';
}

function formatPositionCount(positionCount) {
  if (!positionCount || typeof positionCount !== 'object') return '';
  const entries = Object.entries(positionCount)
    .filter(([, count]) => count !== null && count !== undefined && count !== '')
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return '';
  return entries.map(([pos, count]) => `${pos}(${count})`).join(', ');
}

function formatPositionCountKey(positionCount) {
  if (!positionCount || typeof positionCount !== 'object') return '';
  const entries = Object.entries(positionCount)
    .filter(([, count]) => count !== null && count !== undefined && count !== '')
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return '';
  return entries.map(([pos, count]) => `${pos}:${count}`).join('|');
}

function updateResultsPositions(tbody) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.forEach((row, index) => {
    const cell = row.querySelector('td');
    if (!cell) return;
    const positionText = `${index + 1}`;
    if (row.dataset.draggable === 'true') {
      cell.innerHTML = `<i class="bi bi-grip-vertical text-muted me-2 tie-move-icon" aria-hidden="true"></i>${positionText}`;
    } else {
      cell.textContent = positionText;
    }
  });
}

function initResultsTieSorting(bodyEl, status) {
  if (status !== 'FIN') return;
  if (!getEvent().canDecidePositions || !window.Sortable) return;

  const tbody = bodyEl.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (!rows.length) return;

  const usesAvgPosJud = getEvent().totalSystem === 'AVG_POSJUD';
  const getTieKey = (row) => {
    if (usesAvgPosJud) {
      const avgPlace = row.dataset.avgPlace || '';
      const positionCountKey = row.dataset.positionCountKey || '';
      return `${avgPlace}|${positionCountKey}`;
    }
    return row.dataset.score || '';
  };

  const scoreCounts = rows.reduce((acc, row) => {
    const key = getTieKey(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  let hasTies = false;
  rows.forEach(row => {
    const key = getTieKey(row);
    if (scoreCounts[key] > 1) {
      row.dataset.draggable = 'true';
      row.classList.add('results-draggable');
      const firstCell = row.querySelector('td');
      if (firstCell && !firstCell.querySelector('.tie-move-icon')) {
        firstCell.insertAdjacentHTML(
          'afterbegin',
          '<i class="bi bi-grip-vertical text-muted me-2 tie-move-icon" aria-hidden="true"></i>'
        );
      }
      hasTies = true;
    } else {
      row.dataset.draggable = 'false';
    }
  });

  if (!hasTies) return;

  new Sortable(tbody, {
    animation: 150,
    draggable: 'tr[data-draggable="true"]',
    onMove: (evt) => {
      const draggedKey = evt.dragged ? getTieKey(evt.dragged) : '';
      const relatedKey = evt.related ? getTieKey(evt.related) : '';
      if (!draggedKey || !relatedKey) return false;
      return draggedKey === relatedKey;
    },
    onEnd: () => updateResultsPositions(tbody)
  });
}

function buildClassificationFromResultsTable(tbody, resultsData) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const byId = new Map();
  if (Array.isArray(resultsData)) {
    resultsData.forEach(item => {
      const key = item?.dancer_id ?? item?.id;
      if (key !== undefined && key !== null) {
        byId.set(String(key), item);
      }
    });
  }

  return rows.map((row, index) => {
    const dancerIdRaw = row.dataset.dancerId;
    const dancerId = dancerIdRaw !== undefined ? String(dancerIdRaw) : null;
    if (dancerId && byId.has(dancerId)) {
      return { ...byId.get(dancerId) };
    }

    const avgPlaceRaw = row.dataset.avgPlace;
    const totalScoreRaw = row.dataset.score;
    return {
      dancer_id: dancerId ? Number(dancerId) : null,
      dancer_name: null,
      dancer_nationality: null,
      total_score: totalScoreRaw !== undefined && totalScoreRaw !== '' ? Number(totalScoreRaw) : null,
      avg_place: avgPlaceRaw !== undefined && avgPlaceRaw !== '' ? Number(avgPlaceRaw) : null
    };
  });
}

async function showResults(categoryId, styleId, status) {
  const modalEl = document.getElementById('resultsModal');
  const bodyEl = document.getElementById('resultsModalBody');
  const modalTitle = document.getElementById('resultsModalLabel');
  const saveClassificationBtn = document.getElementById('saveClassificationBtn');
  const showAvgPlace = shouldShowAvgPlaceColumn();
  const showPositions = showAvgPlace && status === 'FIN';

  modalTitle.textContent = t('view_results');
  if (modalEl) {
    modalEl.dataset.categoryId = categoryId;
    modalEl.dataset.styleId = styleId;
    const dialogEl = modalEl.querySelector('.modal-dialog');
    if (dialogEl) {
      dialogEl.classList.toggle('results-modal-wide', showPositions);
    }
  }
  if (saveClassificationBtn) {
    if (getEvent().canDecidePositions) {
      saveClassificationBtn.classList.remove('d-none');
      saveClassificationBtn.disabled = false;
    } else {
      saveClassificationBtn.classList.add('d-none');
    }
  }
  const provisionalNote = status !== 'FIN'
    ? `
      <div class="alert alert-warning text-center mb-3">
        ${t('results_provisional')}
      </div>
    `
    : '';

  bodyEl.innerHTML = `
    ${provisionalNote}
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${t('loading')}</span>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  try {
    const url = `${API_BASE_URL}/api/competitions/tracking/results?event_id=${getEvent().id}&category_id=${categoryId}&style_id=${styleId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Error loading results');
    }

    const results = await res.json();
    if (modalEl) {
      modalEl._resultsData = results;
    }

    if (!results || results.length === 0) {
      bodyEl.innerHTML = `
        <div class="alert alert-info text-center mb-0">
          ${t('no_votes_yet')}
        </div>
      `;
      return;
    }

    const rows = results.map((r, index) => {
      const dancerFlagHtml = getDancerFlagImgHtml(r.dancer_nationality, {
        className: 'me-2',
        style: 'vertical-align: middle;'
      });
      const dancerCell = `
        <div class="d-flex align-items-center gap-2 results-dancer-row">
          <div class="d-flex align-items-center results-dancer-content">
            ${dancerFlagHtml}
            <span class="results-dancer-name">${r.dancer_name}</span>
          </div>
        </div>
      `;
      const scoreValue = formatResultScore(r.total_score);
      const scoreKey = String(scoreValue);
      const avgPlaceText = formatAvgPlace(r.avg_place);
      const positionCountText = formatPositionCount(r.positionCount);
      const positionCountKey = formatPositionCountKey(r.positionCount);
      const dancerId = r.dancer_id ?? r.id ?? '';
      const avgPlaceKey = r.avg_place ?? '';
      return `
        <tr data-score="${scoreKey}" data-dancer-id="${dancerId}" data-avg-place="${avgPlaceKey}" data-position-count-key="${positionCountKey}">
          <td class="fw-semibold">${index + 1}</td>
          <td class="results-dancer-cell">${dancerCell}</td>
          <td class="fw-semibold">${scoreValue}</td>
          ${showPositions ? `<td class="fw-semibold">${positionCountText}</td>` : ''}
          ${showAvgPlace ? `<td class="fw-semibold">${avgPlaceText}</td>` : ''}
        </tr>
      `;
    }).join('');

    bodyEl.innerHTML = `
      ${provisionalNote}
      <div class="table-responsive">
        <table class="table table-bordered align-middle text-center mb-0">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>${t('dancer')}</th>
              <th>${t('total')}</th>
              ${showPositions ? `<th>${t('positions')}</th>` : ''}
              ${showAvgPlace ? `<th>${t('avg_place')}</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    initResultsTieSorting(bodyEl, status);
  } catch (err) {
    console.error('Error fetching results:', err);
    bodyEl.innerHTML = `
      ${provisionalNote}
      <div class="alert alert-danger text-center mb-0">
        ${t('error_title')}
      </div>
    `;
  }
}




